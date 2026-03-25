// indexnow.js
// Node.js CLI script for IndexNow API submission
// Requirements: axios, xml2js, fs, path

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
let chalk = require('chalk');
if (typeof chalk !== 'function' && chalk.default) {
  chalk = chalk.default;
}

// Config
const DOMAINS_FILE = path.join(__dirname, 'domains.txt');
const CONFIG_FILE = path.join(__dirname, 'config.json');
// LOG_FILE removed for production
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const SITEMAP_TYPES = ['page-sitemap.xml', 'post-sitemap.xml', 'category-sitemap.xml'];
const BATCH_SIZE = 1000; // IndexNow allows up to 10,000, but keep it safe
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 1000; // 1s between API calls

// Utility: Sleep
const sleep = ms => new Promise(res => setTimeout(res, ms));

// Utility: Validate URL
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Read config
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Config file not found: ${CONFIG_FILE}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw);
    if (!config.indexNowKey || typeof config.indexNowKey !== 'string') {
      throw new Error('Missing or invalid indexNowKey.');
    }
    if (!config.engines || typeof config.engines !== 'object') {
      throw new Error('Missing or invalid engines.');
    }
    // keyLocation is now optional, so no check
    return config;
  } catch (e) {
    console.error('Failed to parse config.json:', e.message);
    process.exit(1);
  }
}

// Read domains
function readDomains() {
  if (!fs.existsSync(DOMAINS_FILE)) {
    console.error(`Domains file not found: ${DOMAINS_FILE}`);
    process.exit(1);
  }
  return fs.readFileSync(DOMAINS_FILE, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      // Remove protocol (http:// or https://) and trailing slashes
      return line.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    });
}

// Fetch and parse XML
async function fetchXml(url) {
  try {
    const res = await axios.get(url, { timeout: 15000 });
    return await xml2js.parseStringPromise(res.data);
  } catch (e) {
    throw new Error(`Failed to fetch/parse XML: ${url} (${e.message})`);
  }
}

// Recursively extract sitemap URLs
async function extractUrlsFromSitemap(sitemapUrl, seen = new Set()) {
  let urls = [];
  let xml;
  try {
    xml = await fetchXml(sitemapUrl);
  } catch (e) {
    throw e;
  }
  // Sitemap index
  if (xml.sitemapindex && xml.sitemapindex.sitemap) {
    for (const sm of xml.sitemapindex.sitemap) {
      if (sm.loc && sm.loc[0]) {
        const loc = sm.loc[0];
        // Only follow sitemaps of interest
        if (SITEMAP_TYPES.some(type => loc.endsWith(type))) {
          if (!seen.has(loc)) {
            seen.add(loc);
            const childUrls = await extractUrlsFromSitemap(loc, seen);
            urls = urls.concat(childUrls);
          }
        }
      }
    }
  }
  // URL set
  if (xml.urlset && xml.urlset.url) {
    for (const urlEntry of xml.urlset.url) {
      if (urlEntry.loc && urlEntry.loc[0]) {
        const loc = urlEntry.loc[0];
        if (isValidUrl(loc)) {
          urls.push(loc);
        }
      }
    }
  }
  return urls;
}

// Submit URLs to IndexNow
async function submitUrls({ host, key, keyLocation, urlList }, retry = 0) {
  try {
    const payload = { host, key, keyLocation, urlList };
    const res = await axios.post(INDEXNOW_ENDPOINT, payload, { timeout: 15000 });
    return { success: true, status: res.status, data: res.data };
  } catch (e) {
    if (retry < RETRY_LIMIT) {
      await sleep(RETRY_DELAY_MS);
      return submitUrls({ host, key, keyLocation, urlList }, retry + 1);
    }
    return { success: false, error: e.message };
  }
}

// Main
(async () => {
  const config = readConfig();
  const domains = readDomains();
  let totalDomains = 0;
  let totalUrls = 0;
  let failedDomains = [];

  console.log(chalk.bgMagentaBright.bold('🚀 Welcome to the IndexNow Party CLI! 🚀'));
  console.log(chalk.yellowBright('Let the crawling and indexing fiesta begin! 🎉🕺💃'));
  console.log(chalk.magenta('----------------------------------------------'));

  for (const domain of domains) {
    console.log(chalk.cyanBright(`\n🌍 Step 1: Choosing domain: ${domain} 🎯`));
    let allUrls = [];
    try {
      const sitemapIndexUrl = `https://${domain}/sitemap_index.xml`;
      console.log(chalk.blueBright(`🗺️ Fetching sitemap index: ${sitemapIndexUrl}`));
      const urls = await extractUrlsFromSitemap(sitemapIndexUrl);
      allUrls = Array.from(new Set(urls)).filter(isValidUrl);
      if (!allUrls.length) throw new Error('No URLs found in sitemaps.');
      console.log(chalk.greenBright(`🍕 Step 2: Extracted ${allUrls.length} URLs from sitemaps! URLs galore! 🎈`));
    } catch (e) {
      console.error(chalk.redBright(`💥 Failed to process domain ${domain}: ${e.message} 😱`));
      failedDomains.push(domain);
      continue;
    }
    // Step 3: Submit to each enabled search engine individually
    const key = config.indexNowKey;
    const keyFileName = `${key}.txt`;
    const keyLocation = `https://${domain}/${keyFileName}`;
    const engines = config.engines || {};
    let submittedCount = 0;
    const engineEndpoints = {
      bing: 'https://www.bing.com/indexnow',
      yandex: 'https://yandex.com/indexnow',
      seznam: 'https://search.seznam.cz/indexnow',
      naver: 'https://indexnow.naver.com/indexnow',
      indexnow: 'https://api.indexnow.org/indexnow'
    };
    // For each enabled engine, submit the batch
    for (const [engine, enabled] of Object.entries(engines)) {
      if (!enabled) continue;
      let endpoint = engineEndpoints[engine] || engineEndpoints['indexnow'];
      for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
        const batch = allUrls.slice(i, i + BATCH_SIZE);
        const payload = {
          host: domain,
          key: key,
          keyLocation: keyLocation,
          urlList: batch
        };
        console.log(chalk.yellowBright(`🤖 Step 3: Submitting ${batch.length} URLs to ${engine.toUpperCase()} (${endpoint})...`));
        let result;
        try {
          result = await axios.post(endpoint, payload, { timeout: 15000 });
          console.log(chalk.bgGreen.black(`🎉 Success: ${engine.toUpperCase()} gobbled up ${batch.length} URLs! Status: ${result.status} 🍔`));
        } catch (e) {
          console.error(chalk.bgRed.white(`👾 Failed to submit to ${engine.toUpperCase()}: ${e.response ? e.response.status : ''} ${e.message} 😭`));
        }
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
    totalDomains++;
    totalUrls += allUrls.length;
    console.log(chalk.magentaBright(`🏁 Domain ${domain}: Submitted ${allUrls.length} unique URLs to all enabled search engines! 🚦`));
  }



  // Summary
  console.log(chalk.bgCyanBright.bold('\n🎊🎊🎊 FINAL SUMMARY 🎊🎊🎊'));
  console.log(chalk.cyanBright(`Total domains processed: ${totalDomains} 🏆`));
  console.log(chalk.cyanBright(`Total URLs submitted: ${totalUrls} 🌐`));
  if (failedDomains.length) {
    console.log(chalk.redBright('Failed domains: 💔'));
    failedDomains.forEach(d => console.log(chalk.redBright(`- ${d}`)));
  } else {
    console.log(chalk.greenBright('All domains processed successfully! 🥳🎉'));
  }
  console.log(chalk.magenta('----------------------------------------------'));
})();
