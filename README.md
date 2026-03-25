# IndexNow CLI

A Node.js CLI tool to submit URLs from multiple domains to the IndexNow API and supported search engines.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Configuration](#2-configuration)
3. [Setup](#3-setup)
4. [Usage](#4-usage)
5. [Security](#security)
6. [Requirements](#requirements)
7. [License](#license)

---

## 1. Installation

Clone the repository and install dependencies:

```sh
git clone <your-repo-url>
cd index-now
npm install
```

---

## 2. Configuration

### Generate Your IndexNow Key
1. Generate a 32-character key (you can use an online generator or Node.js):
  ```sh
  node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
  ```
2. Save this key in a text file named `<YOUR_API_KEY>.txt` (e.g., `5f6416461b3e463fbea61855b27ff27l.txt`).
3. Upload this file to the root of each domain you want to submit URLs for (e.g., `https://yourdomain.com/5f6416461b3e463fbea61855b27ff27l.txt`).

### Configure the CLI
1. Copy the example config:
  ```sh
  cp config.example.json config.json
  ```
2. Edit `config.json` and set your key and engine options. **Never commit your real key or config.json!**

---

## 3. Setup

1. Prepare your `domains.txt` file:
  - One domain per line (no protocol, e.g., `example.com`)
  **Note:** Do not include `http://` or `https://` in your `domains.txt` entries. Only use the domain name (e.g., `example.com`).
2. Ensure your IndexNow key file is uploaded to the root of each domain.
3. Confirm your `config.json` is correct and not tracked by git.

---

## 4. Usage

Run the CLI:

```sh
node indexnow.js
```

You’ll see colorful, step-by-step logs for each domain and search engine.

---

## Security

- Never commit your real `config.json` or any `.txt` key files to version control. `.gitignore` is set up to prevent this.
- Only share `config.example.json` for configuration reference.

---

## Requirements

- Node.js 16+
- Dependencies: axios, xml2js, chalk

---

## License

MIT

