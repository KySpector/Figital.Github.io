// ===== FIGITAL — Web3 App Logic =====

// --- Constants ---
const FIGI_CONTRACT = '0x72d2B2e37134BFa2a36C1014A2264722d9A70dC4';
const BASE_CHAIN_ID = '0x2105'; // 8453 in hex
const BASE_CHAIN_CONFIG = {
    chainId: BASE_CHAIN_ID,
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org', 'https://base.meowrpc.com', 'https://1rpc.io/base'],
    blockExplorerUrls: ['https://basescan.org']
};

// --- State ---
let walletState = {
    connected: false,
    address: null,
    provider: null,
    signer: null
};

// --- DOM Elements ---
const navbar = document.getElementById('navbar');
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');
const navConnectBtn = document.getElementById('navConnectBtn');
const walletModal = document.getElementById('walletModal');
const modalClose = document.getElementById('modalClose');
const purchaseModal = document.getElementById('purchaseModal');
const purchaseModalClose = document.getElementById('purchaseModalClose');
const purchaseAmount = document.getElementById('purchaseAmount');
const estimateAmount = document.getElementById('estimateAmount');
const confirmPurchase = document.getElementById('confirmPurchase');
const buyFigiBtn = document.getElementById('buyFigiBtn');
const copyBtn = document.getElementById('copyContract');

// --- Navbar ---
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

mobileToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('active'));
});

// --- Copy Contract Address ---
if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        const address = document.getElementById('contractAddress').textContent;
        navigator.clipboard.writeText(address).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
    });
}

// --- Modal Helpers ---
function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Close modals on overlay click
[walletModal, purchaseModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
});

modalClose.addEventListener('click', () => closeModal(walletModal));
purchaseModalClose.addEventListener('click', () => closeModal(purchaseModal));

// Close modals on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal(walletModal);
        closeModal(purchaseModal);
    }
});

// --- Wallet Connection ---
function openWalletModal() {
    if (walletState.connected) {
        openModal(purchaseModal);
    } else {
        openModal(walletModal);
    }
}

// Nav connect button
navConnectBtn.addEventListener('click', openWalletModal);

// Buy $FIGI button in CTA section
if (buyFigiBtn) {
    buyFigiBtn.addEventListener('click', openWalletModal);
}

// Buy Now buttons on asset cards
document.querySelectorAll('.buy-asset-btn').forEach(btn => {
    btn.addEventListener('click', openWalletModal);
});

// Buy $FIGI button in token section
document.querySelectorAll('a[href="#buy"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        openWalletModal();
    });
});

// --- Switch to Base Network ---
async function switchToBase(provider) {
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_ID }]
        });
    } catch (switchError) {
        // Chain not added yet — add it (4902 standard, -32603 some wallets)
        if (switchError.code === 4902 || switchError.code === -32603 ||
            switchError?.data?.originalError?.code === 4902) {
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [BASE_CHAIN_CONFIG]
                });
            } catch (addError) {
                showNotification('Could not add Base network. Please add it manually in your wallet.', 'error');
                throw addError;
            }
        } else if (switchError.code === 4001) {
            showNotification('You need to switch to Base network to continue.', 'error');
            throw switchError;
        } else {
            throw switchError;
        }
    }
}

// --- Detect Wallet Provider ---
function getProvider(walletType) {
    if (walletType === 'metamask') {
        // MetaMask injects window.ethereum with isMetaMask
        if (window.ethereum?.isMetaMask) return window.ethereum;
        // If multiple providers (EIP-6963)
        if (window.ethereum?.providers) {
            const mm = window.ethereum.providers.find(p => p.isMetaMask);
            if (mm) return mm;
        }
        return null;
    }

    if (walletType === 'coinbase') {
        // Coinbase Wallet injects as coinbaseWalletExtension or isCoinbaseWallet
        if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
        if (window.ethereum?.isCoinbaseWallet) return window.ethereum;
        if (window.ethereum?.providers) {
            const cb = window.ethereum.providers.find(p => p.isCoinbaseWallet);
            if (cb) return cb;
        }
        return null;
    }

    if (walletType === 'rainbow') {
        if (window.ethereum?.isRainbow) return window.ethereum;
        if (window.ethereum?.providers) {
            const rb = window.ethereum.providers.find(p => p.isRainbow);
            if (rb) return rb;
        }
        return null;
    }

    // Fallback: use whatever ethereum provider is available
    return window.ethereum || null;
}

// --- Connect Wallet ---
async function connectWallet(walletType) {
    // WalletConnect requires a separate SDK — show instructions
    if (walletType === 'walletconnect') {
        closeModal(walletModal);
        showNotification('WalletConnect: Scan the QR code from your mobile wallet. Full WalletConnect v2 integration coming soon.', 'info');
        return;
    }

    const provider = getProvider(walletType);

    if (!provider) {
        const walletNames = {
            metamask: 'MetaMask',
            coinbase: 'Coinbase Wallet',
            rainbow: 'Rainbow'
        };
        showNotification(`${walletNames[walletType]} not detected. Please install the extension and refresh.`, 'error');
        return;
    }

    try {
        // Request account access
        const accounts = await provider.request({ method: 'eth_requestAccounts' });

        if (accounts.length === 0) {
            showNotification('No accounts found. Please unlock your wallet.', 'error');
            return;
        }

        // Switch to Base chain
        await switchToBase(provider);

        // Set up ethers
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        const signer = ethersProvider.getSigner();
        const address = accounts[0];

        walletState = {
            connected: true,
            address: address,
            provider: ethersProvider,
            signer: signer
        };

        updateWalletUI();
        closeModal(walletModal);
        showNotification(`Connected: ${shortenAddress(address)}`, 'success');

        // Listen for account/chain changes
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', () => window.location.reload());

    } catch (err) {
        console.error('Wallet connection error:', err);
        if (err.code === 4001) {
            showNotification('Connection rejected by user.', 'error');
        } else {
            showNotification('Failed to connect wallet. Please try again.', 'error');
        }
    }
}

// Handle account changes
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        walletState.address = accounts[0];
        updateWalletUI();
    }
}

// Disconnect
function disconnectWallet() {
    walletState = { connected: false, address: null, provider: null, signer: null };
    updateWalletUI();
    showNotification('Wallet disconnected.', 'info');
}

// --- Wallet UI State ---
function updateWalletUI() {
    if (walletState.connected) {
        navConnectBtn.textContent = shortenAddress(walletState.address);
        navConnectBtn.classList.add('btn-connected');

        // Update Buy buttons text
        if (buyFigiBtn) buyFigiBtn.textContent = 'Buy $FIGI';
    } else {
        navConnectBtn.textContent = 'Connect Wallet';
        navConnectBtn.classList.remove('btn-connected');
    }
}

// --- Wallet Option Click Handlers ---
document.querySelectorAll('.wallet-option').forEach(option => {
    option.addEventListener('click', () => {
        const walletType = option.dataset.wallet;
        connectWallet(walletType);
    });
});

// --- Purchase Flow ---
if (purchaseAmount) {
    purchaseAmount.addEventListener('input', () => {
        const eth = parseFloat(purchaseAmount.value);
        if (eth > 0) {
            // Estimate: at $0.01/FIGI, using a rough ETH price placeholder
            // In production, fetch live ETH/USD price from an oracle
            const ethPriceUSD = 3500; // placeholder
            const figiAmount = Math.floor((eth * ethPriceUSD) / 0.01);
            estimateAmount.textContent = `~${figiAmount.toLocaleString()} $FIGI`;
        } else {
            estimateAmount.textContent = '— $FIGI';
        }
    });
}

if (confirmPurchase) {
    confirmPurchase.addEventListener('click', async () => {
        if (!walletState.connected) {
            closeModal(purchaseModal);
            openModal(walletModal);
            return;
        }

        const eth = parseFloat(purchaseAmount.value);
        if (!eth || eth <= 0) {
            showNotification('Please enter a valid amount.', 'error');
            return;
        }

        try {
            confirmPurchase.textContent = 'Confirming...';
            confirmPurchase.disabled = true;

            const tx = await walletState.signer.sendTransaction({
                to: FIGI_CONTRACT,
                value: ethers.utils.parseEther(eth.toString())
            });

            showNotification('Transaction submitted! Waiting for confirmation...', 'info');
            closeModal(purchaseModal);

            await tx.wait();
            showNotification(`Transaction confirmed! TX: ${shortenAddress(tx.hash)}`, 'success');

        } catch (err) {
            console.error('Transaction error:', err);
            if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
                showNotification('Transaction rejected by user.', 'error');
            } else {
                showNotification('Transaction failed. Please try again.', 'error');
            }
        } finally {
            confirmPurchase.textContent = 'Confirm Purchase';
            confirmPurchase.disabled = false;
        }
    });
}

// --- Notification System ---
function showNotification(message, type) {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;
    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => notification.classList.add('visible'));

    // Auto-dismiss
    const timeout = setTimeout(() => removeNotification(notification), 5000);

    notification.querySelector('.notification-close').addEventListener('click', () => {
        clearTimeout(timeout);
        removeNotification(notification);
    });
}

function removeNotification(el) {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
}

// --- Helpers ---
function shortenAddress(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// --- Scroll Reveal ---
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .step, .asset-card, .token-layout').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

document.head.insertAdjacentHTML('beforeend', `
    <style>
        .visible { opacity: 1 !important; transform: translateY(0) !important; }
    </style>
`);
