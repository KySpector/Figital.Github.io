// ===== FIGITAL — Liquidity Pools Logic =====

// --- Constants ---
const FIGI_CONTRACT = '0x72d2B2e37134BFa2a36C1014A2264722d9A70dC4';
const FIGITAL_NFT_CONTRACT = '0x84Aedaecd801d71B8De522308307a9f4586352f9';
const FIGITAL_MINTER_CONTRACT = '0x83A19B3c431781A5352E9EDDF811Fb45a39a2554';
const USDC_CONTRACT_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH_CONTRACT_BASE = '0x4200000000000000000000000000000000000006';
const CBBTC_CONTRACT_BASE = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';

const BASE_CHAIN_ID = '0x2105';
const BASE_CHAIN_CONFIG = {
    chainId: BASE_CHAIN_ID,
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org', 'https://base.meowrpc.com', 'https://1rpc.io/base'],
    blockExplorerUrls: ['https://basescan.org']
};

// Uniswap V3 NonfungiblePositionManager on Base
const UNISWAP_V3_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const FEE_TIER = 3000; // 0.3%

// ERC-20 ABI
const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)'
];

// Uniswap V3 Factory ABI (getPool)
const FACTORY_ABI = [
    'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'
];

// Uniswap V3 NonfungiblePositionManager ABI (mint, collect, decreaseLiquidity)
const POSITION_MANAGER_ABI = [
    'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)',
    'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) returns (uint256 amount0, uint256 amount1)',
    'function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)'
];

// Pool configurations
const POOLS = {
    'figi-eth': {
        name: 'FIGI / ETH',
        token0: FIGI_CONTRACT,
        token1: WETH_CONTRACT_BASE,
        token0Symbol: 'FIGI',
        token1Symbol: 'ETH',
        token0Decimals: 18,
        token1Decimals: 18,
        isNativeETH: true
    },
    'figi-usdc': {
        name: 'FIGI / USDC',
        token0: FIGI_CONTRACT,
        token1: USDC_CONTRACT_BASE,
        token0Symbol: 'FIGI',
        token1Symbol: 'USDC',
        token0Decimals: 18,
        token1Decimals: 6,
        isNativeETH: false
    },
    'figi-btc': {
        name: 'FIGI / BTC',
        token0: FIGI_CONTRACT,
        token1: CBBTC_CONTRACT_BASE,
        token0Symbol: 'FIGI',
        token1Symbol: 'cbBTC',
        token0Decimals: 18,
        token1Decimals: 8,
        isNativeETH: false
    }
};

// --- State ---
let walletState = {
    connected: false,
    address: null,
    provider: null,
    signer: null
};
let activePool = null;

// --- DOM Elements ---
const navbar = document.getElementById('navbar');
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');
const navConnectBtn = document.getElementById('navConnectBtn');
const walletModal = document.getElementById('walletModal');
const modalClose = document.getElementById('modalClose');
const liquidityModal = document.getElementById('liquidityModal');
const liquidityModalClose = document.getElementById('liquidityModalClose');
const liquidityModalTitle = document.getElementById('liquidityModalTitle');
const liquidityPairDisplay = document.getElementById('liquidityPairDisplay');
const tokenAAmount = document.getElementById('tokenAAmount');
const tokenBAmount = document.getElementById('tokenBAmount');
const tokenABalance = document.getElementById('tokenABalance');
const tokenBBalance = document.getElementById('tokenBBalance');
const tokenALabel = document.getElementById('tokenALabel');
const tokenBLabel = document.getElementById('tokenBLabel');
const tokenASuffix = document.getElementById('tokenASuffix');
const tokenBSuffix = document.getElementById('tokenBSuffix');
const confirmLiquidity = document.getElementById('confirmLiquidity');
const poolShareEst = document.getElementById('poolShareEst');

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

// --- Modal Helpers ---
function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

[walletModal, liquidityModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
});

modalClose.addEventListener('click', () => closeModal(walletModal));
liquidityModalClose.addEventListener('click', () => closeModal(liquidityModal));

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal(walletModal);
        closeModal(liquidityModal);
    }
});

// --- Wallet Connection (shared with main site) ---
navConnectBtn.addEventListener('click', () => {
    if (walletState.connected) {
        disconnectWallet();
    } else {
        openModal(walletModal);
    }
});

async function switchToBase(provider) {
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_ID }]
        });
    } catch (switchError) {
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

function getProvider(walletType) {
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
        if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
        if (providers.length > 0) {
            const cb = providers.find(p => p.isCoinbaseWallet || p.isCoinbaseBrowser);
            if (cb) return cb;
        }
        if (window.ethereum?.isCoinbaseWallet || window.ethereum?.isCoinbaseBrowser) return window.ethereum;
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

async function connectWallet(walletType) {
    if (walletType === 'walletconnect') {
        closeModal(walletModal);
        showNotification('WalletConnect v2 integration coming soon.', 'info');
        return;
    }

    const provider = getProvider(walletType);

    if (!provider) {
        const walletNames = { metamask: 'MetaMask', coinbase: 'Coinbase Wallet', rainbow: 'Rainbow' };
        showNotification(`${walletNames[walletType]} not detected. Please install the extension and refresh.`, 'error');
        return;
    }

    try {
        let accounts;
        try {
            accounts = await provider.request({ method: 'eth_requestAccounts' });
        } catch (reqErr) {
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

        try {
            await switchToBase(provider);
        } catch (chainErr) {
            if (chainErr.code !== 4001) {
                showNotification('Connected, but could not switch to Base. Please switch manually.', 'info');
            } else {
                throw chainErr;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const ethersProvider = new ethers.providers.Web3Provider(provider, 'any');
        const signer = ethersProvider.getSigner();

        walletState = { connected: true, address, provider: ethersProvider, signer };

        updateWalletUI();
        closeModal(walletModal);
        showNotification(`Connected: ${shortenAddress(address)}`, 'success');

        // Check pool states now that wallet is connected
        checkPoolStates();

        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', (chainId) => {
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
            showNotification(`Connection failed: ${err.message || 'Unknown error.'}`, 'error');
        }
    }
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        walletState.address = accounts[0];
        updateWalletUI();
    }
}

function disconnectWallet() {
    walletState = { connected: false, address: null, provider: null, signer: null };
    updateWalletUI();
    showNotification('Wallet disconnected.', 'info');
}

function updateWalletUI() {
    if (walletState.connected) {
        navConnectBtn.textContent = shortenAddress(walletState.address);
        navConnectBtn.classList.add('btn-connected');
    } else {
        navConnectBtn.textContent = 'Connect Wallet';
        navConnectBtn.classList.remove('btn-connected');
    }
}

document.querySelectorAll('.wallet-option').forEach(option => {
    option.addEventListener('click', () => connectWallet(option.dataset.wallet));
});

// --- Pool Details Toggle ---
document.querySelectorAll('.pool-details-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const poolId = btn.dataset.pool;
        const detailsMap = {
            'figi-eth': 'detailsFigiEth',
            'figi-usdc': 'detailsFigiUsdc',
            'figi-btc': 'detailsFigiBtc'
        };
        const details = document.getElementById(detailsMap[poolId]);
        const arrow = btn.querySelector('.toggle-arrow');

        details.classList.toggle('open');
        arrow.classList.toggle('rotated');
    });
});

// --- Check Pool States (whether pools exist on-chain) ---
async function checkPoolStates() {
    if (!walletState.connected) return;

    try {
        const factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, walletState.provider);

        for (const [poolId, pool] of Object.entries(POOLS)) {
            try {
                // Sort tokens (Uniswap requires token0 < token1)
                const [sortedToken0, sortedToken1] = sortTokens(pool.token0, pool.token1);
                const poolAddress = await factory.getPool(sortedToken0, sortedToken1, FEE_TIER);

                const badge = document.querySelector(`#pool${toCamelId(poolId)} .pool-badge-active`);
                if (poolAddress && poolAddress !== ethers.constants.AddressZero) {
                    badge.textContent = 'Active';
                    badge.className = 'pool-badge pool-badge-active';
                } else {
                    badge.textContent = 'Not Deployed';
                    badge.className = 'pool-badge pool-badge-pending';
                }
            } catch (e) {
                console.error(`Error checking pool ${poolId}:`, e);
            }
        }
    } catch (e) {
        console.error('Error checking pool states:', e);
    }
}

function sortTokens(tokenA, tokenB) {
    return tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
}

function toCamelId(poolId) {
    return poolId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

// --- Add Liquidity UI ---
document.querySelectorAll('.add-liquidity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!walletState.connected) {
            openModal(walletModal);
            return;
        }

        const poolId = btn.dataset.pool;
        const pool = POOLS[poolId];
        activePool = poolId;

        // Configure modal
        liquidityModalTitle.textContent = `Add Liquidity — ${pool.name}`;
        tokenALabel.textContent = pool.token0Symbol;
        tokenBLabel.textContent = pool.token1Symbol;
        tokenASuffix.textContent = pool.token0Symbol;
        tokenBSuffix.textContent = pool.token1Symbol;

        liquidityPairDisplay.innerHTML = `
            <div class="liq-pair-icons">
                <span class="pool-icon pool-icon-figi">F</span>
                <span class="pool-icon pool-icon-${poolId.split('-')[1]}">${getTokenIcon(poolId)}</span>
            </div>
            <span class="liq-pair-name">${pool.name}</span>
            <span class="liq-pair-fee">0.3% fee</span>
        `;

        // Reset inputs
        tokenAAmount.value = '';
        tokenBAmount.value = '';
        poolShareEst.textContent = '—';

        // Fetch balances
        fetchTokenBalances(pool);

        openModal(liquidityModal);
    });
});

function getTokenIcon(poolId) {
    const icons = { 'figi-eth': '\u25C6', 'figi-usdc': '$', 'figi-btc': '\u20BF' };
    return icons[poolId] || '?';
}

async function fetchTokenBalances(pool) {
    if (!walletState.connected) return;

    try {
        // Token A (FIGI) balance
        const tokenA = new ethers.Contract(pool.token0, ERC20_ABI, walletState.provider);
        const balA = await tokenA.balanceOf(walletState.address);
        const fmtA = ethers.utils.formatUnits(balA, pool.token0Decimals);
        tokenABalance.textContent = `Balance: ${parseFloat(fmtA).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

        // Token B balance
        if (pool.isNativeETH) {
            const ethBal = await walletState.provider.getBalance(walletState.address);
            const fmtB = ethers.utils.formatEther(ethBal);
            tokenBBalance.textContent = `Balance: ${parseFloat(fmtB).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
        } else {
            const tokenB = new ethers.Contract(pool.token1, ERC20_ABI, walletState.provider);
            const balB = await tokenB.balanceOf(walletState.address);
            const fmtB = ethers.utils.formatUnits(balB, pool.token1Decimals);
            tokenBBalance.textContent = `Balance: ${parseFloat(fmtB).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
        }
    } catch (err) {
        console.error('Balance fetch error:', err);
        tokenABalance.textContent = 'Balance: Error';
        tokenBBalance.textContent = 'Balance: Error';
    }
}

// --- Confirm Add Liquidity ---
confirmLiquidity.addEventListener('click', async () => {
    if (!walletState.connected) {
        closeModal(liquidityModal);
        openModal(walletModal);
        return;
    }

    if (!activePool) return;

    const pool = POOLS[activePool];
    const amountA = parseFloat(tokenAAmount.value);
    const amountB = parseFloat(tokenBAmount.value);

    if (!amountA || amountA <= 0 || !amountB || amountB <= 0) {
        showNotification('Please enter valid amounts for both tokens.', 'error');
        return;
    }

    try {
        confirmLiquidity.disabled = true;

        const [sortedToken0, sortedToken1] = sortTokens(pool.token0, pool.token1);
        const isToken0First = pool.token0.toLowerCase() === sortedToken0.toLowerCase();

        const amount0 = isToken0First
            ? ethers.utils.parseUnits(amountA.toString(), pool.token0Decimals)
            : ethers.utils.parseUnits(amountB.toString(), pool.token1Decimals);
        const amount1 = isToken0First
            ? ethers.utils.parseUnits(amountB.toString(), pool.token1Decimals)
            : ethers.utils.parseUnits(amountA.toString(), pool.token0Decimals);

        // Step 1: Approve token0 (FIGI)
        confirmLiquidity.textContent = 'Approving FIGI...';
        showNotification('Step 1: Approving FIGI spending...', 'info');

        const figiContract = new ethers.Contract(pool.token0, ERC20_ABI, walletState.signer);
        const figiAllowance = await figiContract.allowance(walletState.address, UNISWAP_V3_POSITION_MANAGER);
        const figiAmount = ethers.utils.parseUnits(amountA.toString(), pool.token0Decimals);

        if (figiAllowance.lt(figiAmount)) {
            const approveTx = await figiContract.approve(UNISWAP_V3_POSITION_MANAGER, ethers.constants.MaxUint256);
            await approveTx.wait();
            showNotification('FIGI approved!', 'success');
        }

        // Step 2: Approve token1 (if not native ETH)
        let ethValue = ethers.BigNumber.from(0);
        if (!pool.isNativeETH) {
            confirmLiquidity.textContent = `Approving ${pool.token1Symbol}...`;
            showNotification(`Step 2: Approving ${pool.token1Symbol} spending...`, 'info');

            const token1Contract = new ethers.Contract(pool.token1, ERC20_ABI, walletState.signer);
            const token1Allowance = await token1Contract.allowance(walletState.address, UNISWAP_V3_POSITION_MANAGER);
            const token1Amount = ethers.utils.parseUnits(amountB.toString(), pool.token1Decimals);

            if (token1Allowance.lt(token1Amount)) {
                const approveTx2 = await token1Contract.approve(UNISWAP_V3_POSITION_MANAGER, ethers.constants.MaxUint256);
                await approveTx2.wait();
                showNotification(`${pool.token1Symbol} approved!`, 'success');
            }
        } else {
            // For ETH pair, send ETH as value
            ethValue = ethers.utils.parseEther(amountB.toString());
        }

        // Step 3: Create pool if needed, then add liquidity
        confirmLiquidity.textContent = 'Adding liquidity...';
        showNotification('Creating pool and adding liquidity...', 'info');

        const positionManager = new ethers.Contract(
            UNISWAP_V3_POSITION_MANAGER,
            POSITION_MANAGER_ABI,
            walletState.signer
        );

        // Use full range ticks for simplicity (similar to V2-style)
        const tickLower = -887220; // MIN_TICK rounded to tickSpacing (60 for 0.3%)
        const tickUpper = 887220;  // MAX_TICK rounded to tickSpacing
        const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes

        const mintParams = {
            token0: sortedToken0,
            token1: sortedToken1,
            fee: FEE_TIER,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0, // Accept any slippage for now
            amount1Min: 0,
            recipient: walletState.address,
            deadline: deadline
        };

        const tx = await positionManager.mint(mintParams, { value: ethValue });

        showNotification('Transaction submitted! Waiting for confirmation...', 'info');
        closeModal(liquidityModal);

        const receipt = await tx.wait();
        showNotification(`Liquidity added! TX: ${shortenAddress(receipt.transactionHash)}`, 'success');

        // Refresh pool states
        checkPoolStates();

    } catch (err) {
        console.error('Liquidity error:', err);
        if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
            showNotification('Transaction rejected by user.', 'error');
        } else if (err.reason) {
            showNotification(`Failed: ${err.reason}`, 'error');
        } else {
            showNotification('Failed to add liquidity. The pool may need to be initialized first.', 'error');
        }
    } finally {
        confirmLiquidity.textContent = 'Approve & Add Liquidity';
        confirmLiquidity.disabled = false;
    }
});

// --- Notification System ---
function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;
    document.body.appendChild(notification);
    requestAnimationFrame(() => notification.classList.add('visible'));

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
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.pool-card, .step, .pool-stat-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

document.head.insertAdjacentHTML('beforeend', `
    <style>.visible { opacity: 1 !important; transform: translateY(0) !important; }</style>
`);
