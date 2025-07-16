#!/usr/bin/env node

require('dotenv').config();
const { ethers } = require('ethers');
const { program } = require('commander');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cliProgress = require('cli-progress');
const fs = require('fs');

// Simple color functions
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
  bold: {
    blue: (text) => `\x1b[1m\x1b[34m${text}\x1b[0m`
  }
};

// Chain configurations
const CHAINS = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    xenAddress: '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8',
    startBlock: 15732899, // XEN deployment block on Ethereum
    chunkSize: 450
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    xenAddress: '0xeB585163DEbB1E637c6D617de3bEF99347cd75c8',
    startBlock: 109613347, // Approximate XEN deployment on Optimism
    chunkSize: 450 // Optimism can handle larger chunks
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    xenAddress: '0xffcbF84650cE02DaFE96926B37a0ac5E34932fa5',
    startBlock: 3098388, // Approximate XEN deployment on Base
    chunkSize: 450 // Base can handle larger chunks
  }
};

// XEN Contract ABI
const XEN_ABI = [
  "function userBurns(address) view returns (uint256)",
  "function burn(address user, uint256 amount) public",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

class MultiChainXENBurnTracker {
  constructor(chainKey) {
    if (!CHAINS[chainKey]) {
      throw new Error(`Unsupported chain: ${chainKey}. Supported chains: ${Object.keys(CHAINS).join(', ')}`);
    }
    
    this.chain = CHAINS[chainKey];
    this.chainKey = chainKey;
    this.provider = new ethers.providers.JsonRpcProvider(this.chain.rpcUrl);
    this.contract = new ethers.Contract(this.chain.xenAddress, XEN_ABI, this.provider);
  }

  async initialize() {
    try {
      const network = await this.provider.getNetwork();
      console.log(colors.green(`✓ Connected to ${this.chain.name} (Chain ID: ${network.chainId})`));
      
      // Verify we're on the right chain
      if (network.chainId !== this.chain.chainId) {
        console.log(colors.yellow(`⚠ Warning: Expected chain ID ${this.chain.chainId}, got ${network.chainId}`));
      }
      
      const currentBlock = await this.provider.getBlockNumber();
      console.log(colors.blue(`Current block: ${currentBlock}`));
      
      // Test XEN contract
      try {
        const tokenName = await this.contract.name();
        const tokenSymbol = await this.contract.symbol();
        console.log(colors.blue(`Token: ${tokenName} (${tokenSymbol})`));
        console.log(colors.blue(`Contract: ${this.chain.xenAddress}`));
      } catch (error) {
        console.log(colors.yellow(`⚠ Warning: Could not verify XEN contract details`));
      }
      
      return true;
    } catch (error) {
      console.error(colors.red(`✗ Connection failed: ${error.message}`));
      console.error(colors.yellow(`💡 Check your ALCHEMY_API_KEY in .env file`));
      return false;
    }
  }

  async getAllUserBurnsFromContract() {
    console.log(colors.yellow(`\n📊 Fetching user burns from ${this.chain.name} XEN contract...`));
    
    try {
      const filter = this.contract.filters.Transfer(null, ethers.constants.AddressZero);
      const latestBlock = await this.provider.getBlockNumber();
      const totalBlocks = latestBlock - this.chain.startBlock;
      const numChunks = Math.ceil(totalBlocks / this.chain.chunkSize);
      
      console.log(colors.blue(`📦 Scanning ${totalBlocks.toLocaleString()} blocks in ${numChunks} chunks...`));
      
      const uniqueAddresses = new Set();
      
      const progressBar = new cliProgress.SingleBar({
        format: `${this.chain.name} |{bar}| {percentage}% | {value}/{total} Chunks | Addresses: {addresses}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
      });
      
      progressBar.start(numChunks, 0, { addresses: 0 });
      
      for (let i = 0; i < numChunks; i++) {
        const chunkFromBlock = this.chain.startBlock + (i * this.chain.chunkSize);
        const chunkToBlock = Math.min(chunkFromBlock + this.chain.chunkSize - 1, latestBlock);
        
        try {
          const events = await this.contract.queryFilter(filter, chunkFromBlock, chunkToBlock);
          
          events.forEach(event => {
            uniqueAddresses.add(event.args.from.toLowerCase());
          });
          
          progressBar.update(i + 1, { addresses: uniqueAddresses.size });
          
          // Smaller delay for L2s since they're faster
          const delay = this.chainKey === 'ethereum' ? 100 : 50;
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } catch (chunkError) {
          progressBar.stop();
          console.error(colors.red(`\n✗ Error in chunk ${i + 1}: ${chunkError.message}`));
          throw chunkError;
        }
      }
      
      progressBar.stop();
      console.log(colors.green(`\n✓ Found ${uniqueAddresses.size} unique addresses on ${this.chain.name}`));
      
      // Query userBurns mapping
      console.log(colors.yellow(`🔍 Querying userBurns mapping...`));
      
      const burnTotals = new Map();
      const addresses = Array.from(uniqueAddresses);
      
      const queryBar = new cliProgress.SingleBar({
        format: `Querying ${this.chain.name} |{bar}| {percentage}% | {value}/{total} | Burners: {burners}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
      });
      
      queryBar.start(addresses.length, 0, { burners: 0 });
      
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        
        try {
          const burnAmount = await this.contract.userBurns(address);
          
          if (burnAmount.gt(0)) {
            burnTotals.set(address, burnAmount);
          }
          
          queryBar.update(i + 1, { burners: burnTotals.size });
          
          if (i % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
        } catch (error) {
          continue;
        }
      }
      
      queryBar.stop();
      console.log(colors.green(`\n✓ Found ${burnTotals.size} addresses with burns on ${this.chain.name}`));
      
      return burnTotals;
      
    } catch (error) {
      console.error(colors.red(`✗ Error: ${error.message}`));
      throw error;
    }
  }

  formatBurnData(burnTotals) {
    console.log(colors.yellow(`\n📋 Formatting ${this.chain.name} data...`));
    
    const formattedData = [];
    let totalBurned = ethers.BigNumber.from(0);
    
    for (const [address, amount] of burnTotals.entries()) {
      const burnedXEN = parseFloat(ethers.utils.formatEther(amount));
      if (burnedXEN > 0) {
        formattedData.push({
          chain: this.chain.name,
          address: address,
          burned_xen: burnedXEN,
          burned_wei: amount.toString(),
          rank: 0
        });
        totalBurned = totalBurned.add(amount);
      }
    }
    
    formattedData.sort((a, b) => b.burned_xen - a.burned_xen);
    formattedData.forEach((item, index) => {
      item.rank = index + 1;
    });
    
    console.log(colors.green(`✓ ${this.chain.name}: ${formattedData.length} addresses, ${ethers.utils.formatEther(totalBurned)} XEN burned`));
    
    return { data: formattedData, totalBurned };
  }

  async exportToCSV(data, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `${this.chainKey}_xen_burns_${timestamp}.csv`;
    }
    
    console.log(colors.yellow(`\n💾 Exporting ${this.chain.name} data to: ${filename}`));
    
    const csvWriter = createCsvWriter({
      path: filename,
      header: [
        { id: 'rank', title: 'Rank' },
        { id: 'chain', title: 'Chain' },
        { id: 'address', title: 'Address' },
        { id: 'burned_xen', title: 'Burned XEN' },
        { id: 'burned_wei', title: 'Burned Wei' }
      ]
    });
    
    try {
      await csvWriter.writeRecords(data);
      console.log(colors.green(`✓ CSV exported: ${filename}`));
      
      // Show top 5 burners for this chain
      console.log(colors.yellow(`\n🔥 Top 5 ${this.chain.name} XEN Burners:`));
      data.slice(0, 5).forEach((item, index) => {
        console.log(colors.cyan(`${index + 1}. ${item.address}: ${item.burned_xen.toLocaleString()} XEN`));
      });
      
      return filename;
    } catch (error) {
      console.error(colors.red(`✗ Error exporting CSV: ${error.message}`));
      throw error;
    }
  }

  async generateSnapshot(options = {}) {
    const startTime = Date.now();
    
    console.log(colors.bold.blue(`\n🔥 ${this.chain.name} XEN Burn Snapshot Generator`));
    console.log(colors.blue(`Contract: ${this.chain.xenAddress}`));
    console.log(colors.blue(`Start Block: ${this.chain.startBlock}`));
    
    try {
      const connected = await this.initialize();
      if (!connected) return;
      
      const burnTotals = await this.getAllUserBurnsFromContract();
      
      if (burnTotals.size === 0) {
        console.log(colors.yellow(`⚠ No burns found on ${this.chain.name}`));
        return null;
      }
      
      const { data, totalBurned } = this.formatBurnData(burnTotals);
      const filename = await this.exportToCSV(data, options.output);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(colors.green(`\n✅ ${this.chain.name} snapshot complete in ${duration.toFixed(2)} seconds`));
      
      return {
        chain: this.chain.name,
        addresses: data.length,
        totalBurned: ethers.utils.formatEther(totalBurned),
        filename: filename,
        data: data
      };
      
    } catch (error) {
      console.error(colors.red(`\n❌ ${this.chain.name} Error: ${error.message}`));
      return null;
    }
  }
}

// Multi-chain aggregator
async function generateMultiChainSnapshot(chains, outputPrefix = null) {
  console.log(colors.bold.blue(`\n🌐 Multi-Chain XEN Burn Analysis`));
  console.log(colors.blue(`Chains: ${chains.join(', ')}`));
  
  const results = [];
  const allData = [];
  
  for (const chain of chains) {
    console.log(colors.magenta(`\n${'='.repeat(50)}`));
    console.log(colors.magenta(`Processing ${chain.toUpperCase()}`));
    console.log(colors.magenta(`${'='.repeat(50)}`));
    
    try {
      const tracker = new MultiChainXENBurnTracker(chain);
      const result = await tracker.generateSnapshot({
        output: outputPrefix ? `${outputPrefix}_${chain}.csv` : null
      });
      
      if (result) {
        results.push(result);
        allData.push(...result.data);
      }
      
    } catch (error) {
      console.error(colors.red(`Failed to process ${chain}: ${error.message}`));
    }
  }
  
  // Generate combined report
  if (results.length > 0) {
    console.log(colors.bold.blue(`\n📊 MULTI-CHAIN SUMMARY`));
    console.log(colors.blue(`${'='.repeat(50)}`));
    
    let grandTotal = 0;
    let totalAddresses = 0;
    
    results.forEach(result => {
      console.log(colors.green(`${result.chain}:`));
      console.log(colors.cyan(`  - Addresses: ${result.addresses.toLocaleString()}`));
      console.log(colors.cyan(`  - XEN Burned: ${parseFloat(result.totalBurned).toLocaleString()} XEN`));
      console.log(colors.cyan(`  - File: ${result.filename}`));
      
      grandTotal += parseFloat(result.totalBurned);
      totalAddresses += result.addresses;
    });
    
    console.log(colors.yellow(`\nGRAND TOTAL:`));
    console.log(colors.yellow(`  - Total Addresses: ${totalAddresses.toLocaleString()}`));
    console.log(colors.yellow(`  - Total XEN Burned: ${grandTotal.toLocaleString()} XEN`));
    
    // Export combined CSV
    if (allData.length > 0) {
      const combinedFilename = outputPrefix ? `${outputPrefix}_combined.csv` : `multichain_xen_burns_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      
      // Sort all data by burn amount
      allData.sort((a, b) => b.burned_xen - a.burned_xen);
      allData.forEach((item, index) => {
        item.rank = index + 1;
      });
      
      const csvWriter = createCsvWriter({
        path: combinedFilename,
        header: [
          { id: 'rank', title: 'Global Rank' },
          { id: 'chain', title: 'Chain' },
          { id: 'address', title: 'Address' },
          { id: 'burned_xen', title: 'Burned XEN' },
          { id: 'burned_wei', title: 'Burned Wei' }
        ]
      });
      
      await csvWriter.writeRecords(allData);
      console.log(colors.green(`\n💾 Combined CSV exported: ${combinedFilename}`));
      
      // Show top 10 cross-chain burners
      console.log(colors.yellow(`\n🔥 Top 10 Cross-Chain XEN Burners:`));
      allData.slice(0, 10).forEach((item, index) => {
        console.log(colors.cyan(`${index + 1}. [${item.chain}] ${item.address}: ${item.burned_xen.toLocaleString()} XEN`));
      });
    }
  }
}

// CLI Commands
program
  .name('multichain-xen-burn-tracker')
  .description('Multi-chain CLI tool to track XEN token burns')
  .version('1.0.0');

program
  .command('snapshot')
  .description('Generate XEN burn snapshot for a specific chain')
  .option('-c, --chain <chain>', 'Chain to analyze (ethereum, optimism, base)', 'ethereum')
  .option('-o, --output <filename>', 'Output CSV filename')
  .action(async (options) => {
    try {
      const tracker = new MultiChainXENBurnTracker(options.chain);
      await tracker.generateSnapshot({ output: options.output });
    } catch (error) {
      console.error(colors.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('multichain')
  .description('Generate burn snapshots for multiple chains')
  .option('-c, --chains <chains>', 'Comma-separated list of chains', 'ethereum,optimism,base')
  .option('-o, --output-prefix <prefix>', 'Output filename prefix')
  .action(async (options) => {
    const chains = options.chains.split(',').map(c => c.trim());
    await generateMultiChainSnapshot(chains, options.outputPrefix);
  });

program
  .command('test')
  .description('Test connection to a specific chain')
  .option('-c, --chain <chain>', 'Chain to test (ethereum, optimism, base)', 'ethereum')
  .action(async (options) => {
    try {
      const tracker = new MultiChainXENBurnTracker(options.chain);
      const connected = await tracker.initialize();
      if (connected) {
        console.log(colors.green(`\n✅ ${CHAINS[options.chain].name} connection successful!`));
      }
    } catch (error) {
      console.error(colors.red(`Error: ${error.message}`));
    }
  });

if (process.argv.length === 2) {
  program.help();
}

program.parse();
