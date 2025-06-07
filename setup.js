#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🎯 MiraPay Discord Bot Setup');
console.log('================================\n');

// Check Node.js version
function checkNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    console.error('❌ Node.js 18.0.0 or higher is required');
    console.error(`   Current version: ${nodeVersion}`);
    process.exit(1);
  }
  
  console.log(`✅ Node.js version: ${nodeVersion}`);
}

// Generate secure secrets
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Create .env file
function createEnvFile() {
  const envPath = '.env';
  const examplePath = 'env.example';
  
  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists, skipping creation');
    return;
  }
  
  if (!fs.existsSync(examplePath)) {
    console.error('❌ env.example file not found');
    return;
  }
  
  let envContent = fs.readFileSync(examplePath, 'utf8');
  
  // Replace placeholder values with generated secrets
  envContent = envContent.replace('your_super_secret_jwt_key_here', generateSecret(64));
  envContent = envContent.replace('your_session_secret_here', generateSecret(32));
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file with secure secrets');
  console.log('⚠️  Please edit .env and add your Discord bot token and other settings');
}

// Create necessary directories
function createDirectories() {
  const dirs = ['data', 'logs', 'backups'];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}/`);
    }
  });
}

// Check if dependencies are installed
function checkDependencies() {
  if (!fs.existsSync('node_modules')) {
    console.log('⚠️  Dependencies not installed. Run: npm install');
    return false;
  }
  
  console.log('✅ Dependencies installed');
  return true;
}

// Main setup function
async function setup() {
  try {
    console.log('Checking system requirements...\n');
    
    checkNodeVersion();
    createDirectories();
    createEnvFile();
    
    const depsInstalled = checkDependencies();
    
    console.log('\n🎉 Setup completed!\n');
    
    console.log('Next steps:');
    console.log('1. Edit .env file with your Discord bot token');
    console.log('2. Get your bot token from: https://discord.com/developers/applications');
    console.log('3. Set your Discord User ID in OWNER_IDS');
    
    if (!depsInstalled) {
      console.log('4. Run: npm install');
      console.log('5. Run: npm run build');
      console.log('6. Run: npm start');
    } else {
      console.log('4. Run: npm run build');
      console.log('5. Run: npm start');
    }
    
    console.log('\nFor the dashboard:');
    console.log('- Run: npm run dashboard');
    console.log('- Visit: http://localhost:3000');
    
    console.log('\nFor development:');
    console.log('- Run: npm run dev');
    
    console.log('\n📚 Check README.md for detailed setup instructions');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setup(); 