// ===== FIGITAL — RWA NFT Minter Logic =====

// --- Contracts (Base Mainnet) ---
const FIGI_CONTRACT = '0x72d2B2e37134BFa2a36C1014A2264722d9A70dC4';
const FIGITAL_NFT_CONTRACT = '0x84Aedaecd801d71B8De522308307a9f4586352f9';
const FIGITAL_MINTER_CONTRACT = '0x83A19B3c431781A5352E9EDDF811Fb45a39a2554';

const BASE_CHAIN_ID = '0x2105';
const BASE_CHAIN_CONFIG = {
    chainId: BASE_CHAIN_ID,
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org', 'https://base.meowrpc.com', 'https://1rpc.io/base'],
    blockExplorerUrls: ['https://basescan.org']
};

// Figital Minter ABI
const MINTER_ABI = [
    'function mint(address to, string tokenURI) returns (uint256)',
    'function mintWithFIGI(address to, string tokenURI, uint256 figiAmount) returns (uint256)',
    'function mintPrice() view returns (uint256)',
    'function figiMintPrice() view returns (uint256)'
];

// Pinata API base
const PINATA_API = 'https://api.pinata.cloud';
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// --- State ---
let walletState = { connected: false, address: null, provider: null, signer: null };
let pinataJwtToken = null;
let pinataVerified = false;
let uploadedImageFile = null;
let imageCID = null;
let metadataCID = null;

// --- DOM Elements ---
const navbar = document.getElementById('navbar');
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');
const navConnectBtn = document.getElementById('navConnectBtn');
const walletModal = document.getElementById('walletModal');
const modalClose = document.getElementById('modalClose');

// Pinata
const pinataJwtInput = document.getElementById('pinataJwt');
const verifyPinataBtn = document.getElementById('verifyPinata');
const pinataStatus = document.getElementById('pinataStatus');
const toggleJwtBtn = document.getElementById('toggleJwtVisibility');

// Upload
const uploadZone = document.getElementById('uploadZone');
const imageInput = document.getElementById('imageInput');
const uploadPrompt = document.getElementById('uploadPrompt');
const uploadPreview = document.getElementById('uploadPreview');
const previewImage = document.getElementById('previewImage');
const removeImageBtn = document.getElementById('removeImage');
const pinImageBtn = document.getElementById('pinImage');
const imageCidResult = document.getElementById('imageCidResult');
const imageCidEl = document.getElementById('imageCid');

// Metadata
const pinMetadataBtn = document.getElementById('pinMetadata');
const metadataCidResult = document.getElementById('metadataCidResult');
const metadataCidEl = document.getElementById('metadataCid');

// Mint
const mintToAddress = document.getElementById('mintToAddress');
const mintTokenUri = document.getElementById('mintTokenUri');
const confirmMintBtn = document.getElementById('confirmMint');
const mintResult = document.getElementById('mintResult');
const mintedTokenId = document.getElementById('mintedTokenId');
const mintTxLink = document.getElementById('mintTxLink');

// Preview
const nftPreviewImage = document.getElementById('nftPreviewImage');
const nftPreviewName = document.getElementById('nftPreviewName');
const nftPreviewDesc = document.getElementById('nftPreviewDesc');
const nftPreviewAttrs = document.getElementById('nftPreviewAttrs');
const jsonPreviewContent = document.getElementById('jsonPreviewContent');
const toggleJsonBtn = document.getElementById('toggleJsonPreview');
const jsonPreview = document.getElementById('jsonPreview');

// --- Navbar ---
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

mobileToggle.addEventListener('click', () => navLinks.classList.toggle('active'));
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

walletModal.addEventListener('click', (e) => { if (e.target === walletModal) closeModal(walletModal); });
modalClose.addEventListener('click', () => closeModal(walletModal));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(walletModal); });

// --- Wallet Connection ---
navConnectBtn.addEventListener('click', () => {
    if (walletState.connected) disconnectWallet();
    else openModal(walletModal);
});

async function switchToBase(provider) {
    try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID }] });
    } catch (switchError) {
        if (switchError.code === 4902 || switchError.code === -32603 || switchError?.data?.originalError?.code === 4902) {
            try { await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_CHAIN_CONFIG] }); }
            catch (addError) { showNotification('Could not add Base network.', 'error'); throw addError; }
        } else if (switchError.code === 4001) {
            showNotification('You need to switch to Base network.', 'error'); throw switchError;
        } else { throw switchError; }
    }
}

function getProvider(walletType) {
    const providers = window.ethereum?.providers || [];
    if (walletType === 'metamask') {
        if (providers.length > 0) { const mm = providers.find(p => p.isMetaMask && !p.isCoinbaseWallet); if (mm) return mm; }
        if (window.ethereum?.isMetaMask && !window.ethereum?.isCoinbaseWallet) return window.ethereum;
        return null;
    }
    if (walletType === 'coinbase') {
        if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
        if (providers.length > 0) { const cb = providers.find(p => p.isCoinbaseWallet || p.isCoinbaseBrowser); if (cb) return cb; }
        if (window.ethereum?.isCoinbaseWallet || window.ethereum?.isCoinbaseBrowser) return window.ethereum;
        if (window.ethereum && !window.ethereum.isMetaMask && !window.ethereum.isRainbow) return window.ethereum;
        return null;
    }
    if (walletType === 'rainbow') {
        if (providers.length > 0) { const rb = providers.find(p => p.isRainbow); if (rb) return rb; }
        if (window.ethereum?.isRainbow) return window.ethereum;
        return null;
    }
    return window.ethereum || null;
}

async function connectWallet(walletType) {
    if (walletType === 'walletconnect') { closeModal(walletModal); showNotification('WalletConnect v2 coming soon.', 'info'); return; }
    const provider = getProvider(walletType);
    if (!provider) { showNotification(`Wallet not detected. Install the extension and refresh.`, 'error'); return; }

    try {
        let accounts;
        try { accounts = await provider.request({ method: 'eth_requestAccounts' }); }
        catch (reqErr) { if (reqErr.code === -32002) { showNotification('Request pending — check wallet popup.', 'info'); return; } throw reqErr; }
        if (!accounts || accounts.length === 0) { showNotification('No accounts found.', 'error'); return; }

        try { await switchToBase(provider); }
        catch (chainErr) { if (chainErr.code !== 4001) showNotification('Connected but could not switch to Base.', 'info'); else throw chainErr; }

        await new Promise(resolve => setTimeout(resolve, 500));
        const ethersProvider = new ethers.providers.Web3Provider(provider, 'any');
        const signer = ethersProvider.getSigner();

        walletState = { connected: true, address: accounts[0], provider: ethersProvider, signer };
        updateWalletUI();
        closeModal(walletModal);
        showNotification(`Connected: ${shortenAddress(accounts[0])}`, 'success');

        // Pre-fill mint-to address
        mintToAddress.placeholder = accounts[0];

        provider.on('accountsChanged', (accs) => { if (accs.length === 0) disconnectWallet(); else { walletState.address = accs[0]; updateWalletUI(); } });
        provider.on('chainChanged', (chainId) => {
            walletState.provider = new ethers.providers.Web3Provider(provider, 'any');
            walletState.signer = walletState.provider.getSigner();
            if (chainId !== BASE_CHAIN_ID) showNotification('Please switch back to Base.', 'info');
        });
    } catch (err) {
        console.error('Wallet error:', err);
        if (err.code === 4001 || err.code === 'ACTION_REJECTED') showNotification('Connection rejected.', 'error');
        else showNotification(`Connection failed: ${err.message || 'Unknown error.'}`, 'error');
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

document.querySelectorAll('.wallet-option').forEach(opt => {
    opt.addEventListener('click', () => connectWallet(opt.dataset.wallet));
});

// ===== PINATA INTEGRATION =====

// Toggle JWT visibility
toggleJwtBtn.addEventListener('click', () => {
    if (pinataJwtInput.type === 'password') {
        pinataJwtInput.type = 'text';
        toggleJwtBtn.textContent = 'Hide';
    } else {
        pinataJwtInput.type = 'password';
        toggleJwtBtn.textContent = 'Show';
    }
});

// Verify Pinata connection
verifyPinataBtn.addEventListener('click', async () => {
    const jwt = pinataJwtInput.value.trim();
    if (!jwt) { showNotification('Please enter your Pinata JWT.', 'error'); return; }

    verifyPinataBtn.textContent = 'Verifying...';
    verifyPinataBtn.disabled = true;

    try {
        const res = await fetch(`${PINATA_API}/data/testAuthentication`, {
            headers: { 'Authorization': `Bearer ${jwt}` }
        });

        if (res.ok) {
            pinataJwtToken = jwt;
            pinataVerified = true;
            pinataStatus.innerHTML = '<span class="status-success">Connected to Pinata</span>';
            pinImageBtn.disabled = !uploadedImageFile;
            showNotification('Pinata API verified!', 'success');
        } else {
            pinataStatus.innerHTML = '<span class="status-error">Invalid JWT — check your API key</span>';
            showNotification('Pinata authentication failed.', 'error');
        }
    } catch (err) {
        console.error('Pinata verify error:', err);
        pinataStatus.innerHTML = '<span class="status-error">Connection error</span>';
        showNotification('Could not reach Pinata API.', 'error');
    } finally {
        verifyPinataBtn.textContent = 'Verify Connection';
        verifyPinataBtn.disabled = false;
    }
});

// ===== IMAGE UPLOAD =====

// Click to upload
uploadZone.addEventListener('click', () => {
    if (!uploadedImageFile) imageInput.click();
});

// Drag and drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
});

imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) handleImageFile(imageInput.files[0]);
});

function handleImageFile(file) {
    if (file.size > 25 * 1024 * 1024) {
        showNotification('Image too large. Max 25MB.', 'error');
        return;
    }

    uploadedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        uploadPrompt.style.display = 'none';
        uploadPreview.style.display = 'block';

        // Update NFT preview
        nftPreviewImage.innerHTML = `<img src="${e.target.result}" alt="Preview">`;

        pinImageBtn.disabled = !pinataVerified;
    };
    reader.readAsDataURL(file);
}

removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedImageFile = null;
    imageInput.value = '';
    uploadPrompt.style.display = '';
    uploadPreview.style.display = 'none';
    previewImage.src = '';
    nftPreviewImage.innerHTML = '<span class="nft-preview-placeholder">Upload an image</span>';
    pinImageBtn.disabled = true;
    imageCidResult.style.display = 'none';
    imageCID = null;
    pinMetadataBtn.disabled = true;
    updatePreview();
});

// Pin image to IPFS
pinImageBtn.addEventListener('click', async () => {
    if (!uploadedImageFile || !pinataJwtToken) return;

    pinImageBtn.textContent = 'Uploading to IPFS...';
    pinImageBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', uploadedImageFile);
        formData.append('pinataMetadata', JSON.stringify({
            name: `figital-rwa-${Date.now()}`
        }));

        const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${pinataJwtToken}` },
            body: formData
        });

        if (!res.ok) throw new Error(`Pinata error: ${res.status}`);

        const data = await res.json();
        imageCID = data.IpfsHash;
        imageCidEl.textContent = imageCID;
        imageCidResult.style.display = 'flex';
        pinMetadataBtn.disabled = false;

        showNotification(`Image pinned! CID: ${shortenAddress(imageCID)}`, 'success');
        updatePreview();

    } catch (err) {
        console.error('Image pin error:', err);
        showNotification('Failed to pin image to IPFS.', 'error');
    } finally {
        pinImageBtn.textContent = 'Pin Image to IPFS';
        pinImageBtn.disabled = false;
    }
});

// ===== METADATA =====

// Live preview updates
const metaFields = ['metaName', 'metaDescription', 'metaCategory', 'metaBrand',
    'metaWeight', 'metaMaterial', 'metaPurity', 'metaCondition', 'metaValue', 'metaVault'];

metaFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
});

function buildMetadata() {
    const name = document.getElementById('metaName').value.trim();
    const description = document.getElementById('metaDescription').value.trim();
    const category = document.getElementById('metaCategory').value;
    const brand = document.getElementById('metaBrand').value.trim();
    const weight = document.getElementById('metaWeight').value.trim();
    const material = document.getElementById('metaMaterial').value.trim();
    const purity = document.getElementById('metaPurity').value.trim();
    const condition = document.getElementById('metaCondition').value;
    const value = document.getElementById('metaValue').value.trim();
    const vault = document.getElementById('metaVault').value.trim();

    const attributes = [];
    if (category) attributes.push({ trait_type: 'Category', value: category });
    if (brand) attributes.push({ trait_type: 'Brand', value: brand });
    if (weight) attributes.push({ trait_type: 'Weight', value: weight });
    if (material) attributes.push({ trait_type: 'Material', value: material });
    if (purity) attributes.push({ trait_type: 'Purity', value: purity });
    if (condition) attributes.push({ trait_type: 'Condition', value: condition });
    if (value) attributes.push({ trait_type: 'Appraised Value (USD)', value: value });
    if (vault) attributes.push({ trait_type: 'Vault Location', value: vault });

    // Standard fields
    attributes.push({ trait_type: 'Asset Type', value: 'Real World Asset' });
    attributes.push({ trait_type: 'Network', value: 'Base' });
    attributes.push({ trait_type: 'Custodian', value: 'Figital' });

    const metadata = {
        name: name || 'Untitled Asset',
        description: description || '',
        image: imageCID ? `ipfs://${imageCID}` : '',
        external_url: 'https://kyspector.github.io/Figital.Github.io/',
        attributes: attributes
    };

    return metadata;
}

function updatePreview() {
    const meta = buildMetadata();

    nftPreviewName.textContent = meta.name;
    nftPreviewDesc.textContent = meta.description || 'No description';

    // Attributes
    nftPreviewAttrs.innerHTML = meta.attributes
        .map(a => `<div class="nft-attr"><span class="nft-attr-type">${a.trait_type}</span><span class="nft-attr-value">${a.value}</span></div>`)
        .join('');

    // JSON preview
    jsonPreviewContent.textContent = JSON.stringify(meta, null, 2);
}

// Pin metadata to IPFS
pinMetadataBtn.addEventListener('click', async () => {
    if (!pinataJwtToken || !imageCID) return;

    const name = document.getElementById('metaName').value.trim();
    const description = document.getElementById('metaDescription').value.trim();
    const category = document.getElementById('metaCategory').value;

    if (!name || !description || !category) {
        showNotification('Please fill in Name, Description, and Category.', 'error');
        return;
    }

    pinMetadataBtn.textContent = 'Pinning metadata...';
    pinMetadataBtn.disabled = true;

    try {
        const metadata = buildMetadata();

        const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pinataJwtToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pinataContent: metadata,
                pinataMetadata: {
                    name: `figital-rwa-metadata-${name.replace(/\s+/g, '-').toLowerCase()}`
                }
            })
        });

        if (!res.ok) throw new Error(`Pinata error: ${res.status}`);

        const data = await res.json();
        metadataCID = data.IpfsHash;
        metadataCidEl.textContent = metadataCID;
        metadataCidResult.style.display = 'flex';

        // Set token URI
        const tokenURI = `ipfs://${metadataCID}`;
        mintTokenUri.value = tokenURI;
        confirmMintBtn.disabled = false;

        showNotification(`Metadata pinned! CID: ${shortenAddress(metadataCID)}`, 'success');

    } catch (err) {
        console.error('Metadata pin error:', err);
        showNotification('Failed to pin metadata to IPFS.', 'error');
    } finally {
        pinMetadataBtn.textContent = 'Pin Metadata to IPFS';
        pinMetadataBtn.disabled = false;
    }
});

// JSON preview toggle
toggleJsonBtn.addEventListener('click', () => {
    jsonPreview.classList.toggle('open');
    toggleJsonBtn.querySelector('.toggle-arrow').classList.toggle('rotated');
});

// ===== MINT NFT =====

confirmMintBtn.addEventListener('click', async () => {
    if (!walletState.connected) {
        openModal(walletModal);
        return;
    }

    if (!metadataCID) {
        showNotification('Please pin metadata to IPFS first.', 'error');
        return;
    }

    const toAddress = mintToAddress.value.trim() || walletState.address;
    const tokenURI = `ipfs://${metadataCID}`;

    // Validate address
    if (!ethers.utils.isAddress(toAddress)) {
        showNotification('Invalid recipient address.', 'error');
        return;
    }

    try {
        confirmMintBtn.textContent = 'Minting...';
        confirmMintBtn.disabled = true;

        const minter = new ethers.Contract(FIGITAL_MINTER_CONTRACT, MINTER_ABI, walletState.signer);

        // Try to get mint price (if the contract charges ETH)
        let mintValue = ethers.BigNumber.from(0);
        try {
            mintValue = await minter.mintPrice();
        } catch (e) {
            // mintPrice may not exist — proceed with 0
        }

        showNotification('Confirm the transaction in your wallet...', 'info');

        const tx = await minter.mint(toAddress, tokenURI, { value: mintValue });

        showNotification('Transaction submitted! Waiting for confirmation...', 'info');

        const receipt = await tx.wait();

        // Parse Transfer event to get tokenId
        let tokenId = '—';
        for (const log of receipt.logs) {
            try {
                const iface = new ethers.utils.Interface([
                    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
                ]);
                const parsed = iface.parseLog(log);
                if (parsed.name === 'Transfer') {
                    tokenId = parsed.args.tokenId.toString();
                    break;
                }
            } catch (e) {
                // Not a Transfer event, skip
            }
        }

        // Show success
        mintedTokenId.textContent = `#${tokenId}`;
        mintTxLink.href = `https://basescan.org/tx/${receipt.transactionHash}`;
        mintResult.style.display = 'block';

        showNotification(`NFT minted! Token #${tokenId}`, 'success');

    } catch (err) {
        console.error('Mint error:', err);
        if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
            showNotification('Transaction rejected.', 'error');
        } else if (err.reason) {
            showNotification(`Mint failed: ${err.reason}`, 'error');
        } else {
            showNotification('Mint failed. Check console for details.', 'error');
        }
    } finally {
        confirmMintBtn.textContent = 'Mint RWA NFT';
        confirmMintBtn.disabled = false;
    }
});

// ===== NOTIFICATION SYSTEM =====

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<span>${message}</span><button class="notification-close">&times;</button>`;
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

function shortenAddress(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// Initial preview
updatePreview();
