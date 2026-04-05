// ===== FIGITAL — Web3 App Logic =====

// --- Constants ---
const FIGI_CONTRACT = '0x72d2B2e37134BFa2a36C1014A2264722d9A70dC4';
const USDC_CONTRACT_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const USDC_DECIMALS = 6;
const FIGI_PRICE_USD = 0.01;

// Minimal ERC-20 ABI for balanceOf, approve, and transfer
const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)'
];

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
let selectedCurrency = 'eth';

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
    // Check EIP-6963 multi-provider array first (when multiple wallets installed)
    const providers = window.ethereum?.providers || [];

    if (walletType === 'metamask') {
        if (providers.length > 0) {
            const mm = providers.find(p => p.isMetaMask && !p.isCoinbaseWallet);
            if (mm) return mm;
        }
        if (window.ethereum?.isMetaMask && !window.ethereum?.isCoinbaseWallet) return window.ethereum;
        return null;
    }

    if (walletType === 'coinbase') {
        // Coinbase Wallet Extension injects in multiple ways depending on version:
        // 1. window.coinbaseWalletExtension (dedicated namespace)
        // 2. window.ethereum with isCoinbaseWallet flag
        // 3. window.ethereum with isCoinbaseBrowser flag
        // 4. Inside providers array
        if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
        if (providers.length > 0) {
            const cb = providers.find(p => p.isCoinbaseWallet || p.isCoinbaseBrowser);
            if (cb) return cb;
        }
        if (window.ethereum?.isCoinbaseWallet || window.ethereum?.isCoinbaseBrowser) return window.ethereum;
        // Last resort: if only one provider and no specific flag, it might be Coinbase
        if (window.ethereum && !window.ethereum.isMetaMask && !window.ethereum.isRainbow) return window.ethereum;
        return null;
    }

    if (walletType === 'rainbow') {
        if (providers.length > 0) {
            const rb = providers.find(p => p.isRainbow);
            if (rb) return rb;
        }
        if (window.ethereum?.isRainbow) return window.ethereum;
        return null;
    }

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
        // Step 1: Request account access first
        let accounts;
        try {
            accounts = await provider.request({ method: 'eth_requestAccounts' });
        } catch (reqErr) {
            // Coinbase Wallet sometimes needs a retry after popup closes
            if (reqErr.code === -32002) {
                showNotification('Request already pending — check your wallet popup.', 'info');
                return;
            }
            throw reqErr;
        }

        if (!accounts || accounts.length === 0) {
            showNotification('No accounts found. Please unlock your wallet.', 'error');
            return;
        }

        const address = accounts[0];

        // Step 2: Switch to Base chain
        try {
            await switchToBase(provider);
        } catch (chainErr) {
            // If chain switch fails, still connect but warn
            if (chainErr.code !== 4001) {
                showNotification('Connected, but could not switch to Base. Please switch manually in your wallet.', 'info');
            } else {
                throw chainErr;
            }
        }

        // Step 3: Set up ethers AFTER chain switch completes
        // Small delay to let Coinbase Wallet Extension settle after chain switch
        await new Promise(resolve => setTimeout(resolve, 500));

        const ethersProvider = new ethers.providers.Web3Provider(provider, 'any');
        const signer = ethersProvider.getSigner();

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
        provider.on('chainChanged', (chainId) => {
            // Re-init provider on chain change instead of full reload
            const newProvider = new ethers.providers.Web3Provider(provider, 'any');
            walletState.provider = newProvider;
            walletState.signer = newProvider.getSigner();
            if (chainId !== BASE_CHAIN_ID) {
                showNotification('Please switch back to Base network.', 'info');
            }
        });

    } catch (err) {
        console.error('Wallet connection error:', err);
        if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
            showNotification('Connection rejected by user.', 'error');
        } else {
            showNotification(`Connection failed: ${err.message || 'Unknown error. Please try again.'}`, 'error');
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

// --- Currency Toggle ---
const currencyBtns = document.querySelectorAll('.currency-btn');
const amountLabel = document.getElementById('amountLabel');
const inputSuffix = document.getElementById('inputSuffix');
const usdcBalanceEl = document.getElementById('usdcBalance');
const usdcBalanceValue = document.getElementById('usdcBalanceValue');

currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currencyBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCurrency = btn.dataset.currency;

        if (selectedCurrency === 'usdc') {
            amountLabel.textContent = 'Amount (USDC)';
            inputSuffix.textContent = 'USDC';
            purchaseAmount.placeholder = '10.00';
            purchaseAmount.step = '1';
            purchaseAmount.min = '1';
            usdcBalanceEl.style.display = 'flex';
            fetchUSDCBalance();
        } else {
            amountLabel.textContent = 'Amount (ETH)';
            inputSuffix.textContent = 'ETH';
            purchaseAmount.placeholder = '0.01';
            purchaseAmount.step = '0.001';
            purchaseAmount.min = '0.001';
            usdcBalanceEl.style.display = 'none';
        }
        purchaseAmount.value = '';
        estimateAmount.textContent = '— $FIGI';
    });
});

// Fetch USDC balance
async function fetchUSDCBalance() {
    if (!walletState.connected) {
        usdcBalanceValue.textContent = 'Connect wallet first';
        return;
    }
    try {
        const usdc = new ethers.Contract(USDC_CONTRACT_BASE, ERC20_ABI, walletState.provider);
        const balance = await usdc.balanceOf(walletState.address);
        const formatted = ethers.utils.formatUnits(balance, USDC_DECIMALS);
        usdcBalanceValue.textContent = `${parseFloat(formatted).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
    } catch (err) {
        console.error('USDC balance error:', err);
        usdcBalanceValue.textContent = 'Unable to fetch';
    }
}

// --- Purchase Estimate ---
if (purchaseAmount) {
    purchaseAmount.addEventListener('input', () => {
        const amount = parseFloat(purchaseAmount.value);
        if (amount > 0) {
            if (selectedCurrency === 'usdc') {
                // USDC is 1:1 with USD, so direct calculation
                const figiAmount = Math.floor(amount / FIGI_PRICE_USD);
                estimateAmount.textContent = `~${figiAmount.toLocaleString()} $FIGI`;
            } else {
                // ETH: use placeholder price (in production, fetch from oracle)
                const ethPriceUSD = 3500;
                const figiAmount = Math.floor((amount * ethPriceUSD) / FIGI_PRICE_USD);
                estimateAmount.textContent = `~${figiAmount.toLocaleString()} $FIGI`;
            }
        } else {
            estimateAmount.textContent = '— $FIGI';
        }
    });
}

// --- Confirm Purchase ---
if (confirmPurchase) {
    confirmPurchase.addEventListener('click', async () => {
        if (!walletState.connected) {
            closeModal(purchaseModal);
            openModal(walletModal);
            return;
        }

        const amount = parseFloat(purchaseAmount.value);
        if (!amount || amount <= 0) {
            showNotification('Please enter a valid amount.', 'error');
            return;
        }

        try {
            confirmPurchase.disabled = true;

            if (selectedCurrency === 'usdc') {
                await purchaseWithUSDC(amount);
            } else {
                await purchaseWithETH(amount);
            }

        } catch (err) {
            console.error('Transaction error:', err);
            if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
                showNotification('Transaction rejected by user.', 'error');
            } else {
                showNotification(`Transaction failed: ${err.reason || err.message || 'Please try again.'}`, 'error');
            }
        } finally {
            confirmPurchase.textContent = 'Confirm Purchase';
            confirmPurchase.disabled = false;
        }
    });
}

// --- Purchase with ETH ---
async function purchaseWithETH(amount) {
    confirmPurchase.textContent = 'Confirming...';

    const tx = await walletState.signer.sendTransaction({
        to: FIGI_CONTRACT,
        value: ethers.utils.parseEther(amount.toString())
    });

    showNotification('Transaction submitted! Waiting for confirmation...', 'info');
    closeModal(purchaseModal);

    await tx.wait();
    showNotification(`Transaction confirmed! TX: ${shortenAddress(tx.hash)}`, 'success');
}

// --- Purchase with USDC ---
async function purchaseWithUSDC(amount) {
    const usdc = new ethers.Contract(USDC_CONTRACT_BASE, ERC20_ABI, walletState.signer);
    const amountInUnits = ethers.utils.parseUnits(amount.toString(), USDC_DECIMALS);

    // Step 1: Check balance
    const balance = await usdc.balanceOf(walletState.address);
    if (balance.lt(amountInUnits)) {
        const balFormatted = ethers.utils.formatUnits(balance, USDC_DECIMALS);
        showNotification(`Insufficient USDC balance. You have ${parseFloat(balFormatted).toFixed(2)} USDC.`, 'error');
        return;
    }

    // Step 2: Check allowance and approve if needed
    const allowance = await usdc.allowance(walletState.address, FIGI_CONTRACT);
    if (allowance.lt(amountInUnits)) {
        confirmPurchase.textContent = 'Approving USDC...';
        showNotification('Step 1/2: Approve USDC spending in your wallet...', 'info');

        const approveTx = await usdc.approve(FIGI_CONTRACT, amountInUnits);
        await approveTx.wait();
        showNotification('USDC approved! Now confirming transfer...', 'success');
    }

    // Step 3: Transfer USDC to FIGI contract
    confirmPurchase.textContent = 'Sending USDC...';
    const transferTx = await usdc.transfer(FIGI_CONTRACT, amountInUnits);

    showNotification('USDC transfer submitted! Waiting for confirmation...', 'info');
    closeModal(purchaseModal);

    await transferTx.wait();
    showNotification(`USDC transfer confirmed! TX: ${shortenAddress(transferTx.hash)}`, 'success');
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
