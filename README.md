# Multi-Chain XEN Burn Tracker 🔥

A powerful CLI tool to track and analyze XEN token burns across multiple blockchain networks. Export comprehensive burn data to CSV files for analysis and reporting.

## Features

- **Multi-Chain Support**: Track XEN burns on Ethereum, Optimism, and Base
- **Comprehensive Data**: Fetch burn data from contract events and user burn mappings
- **CSV Export**: Export detailed burn data with rankings and statistics
- **Progress Tracking**: Real-time progress bars for long-running operations
- **Efficient Scanning**: Optimized chunk-based blockchain scanning
- **Cross-Chain Analysis**: Combined reports across all supported chains

## Supported Networks

| Network | Chain ID | XEN Contract Address |
|---------|----------|---------------------|
| Ethereum | 1 | `0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8` |
| Optimism | 10 | `0xeB585163DEbB1E637c6D617de3bEF99347cd75c8` |
| Base | 8453 | `0xffcbF84650cE02DaFE96926B37a0ac5E34932fa5` |

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd xen-burn-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory:
   ```bash
   ALCHEMY_API_KEY=your_alchemy_api_key_here
   ```

   Get your Alchemy API key from [Alchemy Dashboard](https://dashboard.alchemy.com/)

## Usage

### Test Connection

Test connectivity to a specific blockchain:

```bash
node index.js test --chain ethereum
node index.js test --chain optimism
node index.js test --chain base
```

### Generate Single Chain Snapshot

Generate burn data for a specific chain:

```bash
# Ethereum (default)
node index.js snapshot

# Specific chain
node index.js snapshot --chain optimism
node index.js snapshot --chain base

# Custom output filename
node index.js snapshot --chain ethereum --output ethereum_burns_2024.csv
```

### Generate Multi-Chain Analysis

Analyze burns across multiple chains:

```bash
# All supported chains (default)
node index.js multichain

# Specific chains
node index.js multichain --chains ethereum,optimism

# Custom output prefix
node index.js multichain --output-prefix weekly_report
```

## CLI Commands

### `snapshot`
Generate XEN burn snapshot for a specific chain.

**Options:**
- `-c, --chain <chain>`: Chain to analyze (ethereum, optimism, base) [default: ethereum]
- `-o, --output <filename>`: Output CSV filename

**Example:**
```bash
node index.js snapshot --chain optimism --output optimism_burns.csv
```

### `multichain`
Generate burn snapshots for multiple chains with combined analysis.

**Options:**
- `-c, --chains <chains>`: Comma-separated list of chains [default: ethereum,optimism,base]
- `-o, --output-prefix <prefix>`: Output filename prefix

**Example:**
```bash
node index.js multichain --chains ethereum,base --output-prefix q1_2024
```

### `test`
Test connection to a specific chain.

**Options:**
- `-c, --chain <chain>`: Chain to test [default: ethereum]

**Example:**
```bash
node index.js test --chain base
```

## Output Files

### Single Chain CSV Format

| Column | Description |
|--------|-------------|
| Rank | Ranking by burn amount |
| Chain | Blockchain network name |
| Address | Wallet address that burned XEN |
| Burned XEN | Amount burned in XEN tokens |
| Burned Wei | Raw amount in wei |

### Multi-Chain Combined Report

When running multichain analysis, you'll get:

1. **Individual chain files**: `{prefix}_{chain}.csv`
2. **Combined file**: `{prefix}_combined.csv` with global rankings
3. **Console summary**: Top burners and statistics per chain

## How It Works

1. **Event Scanning**: Scans blockchain for Transfer events to the zero address (burns)
2. **Address Collection**: Collects unique addresses that have burned XEN
3. **Burn Mapping**: Queries the `userBurns` mapping for each address
4. **Data Processing**: Formats and ranks burn data
5. **CSV Export**: Exports comprehensive burn statistics

## Performance Optimization

- **Chunked Processing**: Processes blocks in optimized chunks (450 blocks for Ethereum, larger for L2s)
- **Rate Limiting**: Built-in delays to respect RPC limits
- **Progress Tracking**: Real-time progress indication for long operations
- **Error Handling**: Robust error handling with retry mechanisms

## Configuration

### Chain Configuration

Each supported chain has specific configuration in the `CHAINS` object:

```javascript
{
  name: 'Chain Name',
  chainId: 1,
  rpcUrl: 'RPC endpoint URL',
  xenAddress: 'XEN contract address',
  startBlock: 12345, // XEN deployment block
  chunkSize: 450     // Optimized chunk size
}
```

### Environment Variables

- `ALCHEMY_API_KEY`: Your Alchemy API key for blockchain access

## Troubleshooting

### Common Issues

1. **API Key Missing**:
   ```
   ✗ Connection failed: missing ALCHEMY_API_KEY
   ```
   **Solution**: Add your Alchemy API key to the `.env` file

2. **Rate Limiting**:
   ```
   ✗ Error in chunk X: rate limited
   ```
   **Solution**: The tool includes built-in delays. For heavy usage, consider upgrading your Alchemy plan

3. **Network Issues**:
   ```
   ✗ Connection failed: network error
   ```
   **Solution**: Check your internet connection and Alchemy service status

### Getting Help

Run `node index.js --help` to see all available commands and options.

## Example Output

```bash
🔥 Ethereum XEN Burn Snapshot Generator
Contract: 0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8
Start Block: 15732899

✓ Connected to Ethereum (Chain ID: 1)
Current block: 18500000
Token: XEN Crypto (XEN)

📊 Fetching user burns from Ethereum XEN contract...
📦 Scanning 2,767,101 blocks in 6,149 chunks...

Ethereum |████████████████████| 100% | 6149/6149 Chunks | Addresses: 45,231

✓ Found 45,231 unique addresses on Ethereum
🔍 Querying userBurns mapping...

Querying Ethereum |████████████████████| 100% | 45231/45231 | Burners: 12,847

✓ Found 12,847 addresses with burns on Ethereum
✓ Ethereum: 12,847 addresses, 1,234,567,890 XEN burned

💾 Exporting Ethereum data to: ethereum_xen_burns_2024-01-15T10-30-00-000Z.csv

🔥 Top 5 Ethereum XEN Burners:
1. 0x1234...5678: 50,000,000 XEN
2. 0xabcd...efgh: 25,000,000 XEN
3. 0x9876...5432: 15,000,000 XEN
4. 0xfedc...ba98: 10,000,000 XEN
5. 0x5555...aaaa: 8,500,000 XEN

✅ Ethereum snapshot complete in 145.32 seconds
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Author

Created by cb_:)

---

*For support or questions, please open an issue on the repository.*
