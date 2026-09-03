# Test Folder — What Goes Where

This `Test/` folder is a mini-copy — use it to check everything is working before dropping it into the real project.

```
Test/
├── index.js              ← main FCA login file (modified)
├── config.json            ← root config, with "language" key
├── Language/
│   └── index.json          ← log message text (en + bn)
└── smoke-test.js           ← auto check script
```

## 1. `index.js` (goes in the root)
- This file must be placed in the real project's root (where `utils.js`, `plugins/`, `e2ee/` folders are).
- It does `require("./Language/index.json")` and `require("./config.json")` — both are looked up relative to its own directory. So wherever `index.js` lives, `Language/` and `config.json` need to sit right next to it.

## 2. `config.json` (next to index.js, in the root)
- A new key has been added:
  ```json
  { "language": "en", ... }
  ```
- `"en"` → shows English logs
- `"bn"` → shows Bangla logs
- To change the language, just change this one value — no need to touch the code.

## 3. `Language/index.json` (inside a folder named "Language", in the root)
- There are separate blocks for `en` and `bn`.
- Each block must have the same keys (e.g. `LoginSuccess`, `LoginFail`, `BannerTitle`, etc.) — otherwise switching to that language will show a missing message (it falls back to showing the key name).
- If you want to add a new log message, add it to **both** language blocks (en + bn) using the same key name.

## 4. `smoke-test.js` (inside Test/, for running the check)
Running this script performs an automatic check:
- Whether `config.json` is valid and has the `language` key
- Whether `Language/index.json` is valid and has the `en` block plus the block matching the config's language
- Whether `index.js` crashes on load
- Whether every `getLang("KeyName")` call used in `index.js` has a matching key in **every** language block in `Language/index.json` (reports any missing key)

### How to run it
```bash
cd Test
npm install   # if there's no package.json here, copy node_modules from the real project, or run npm install from the original repo
node smoke-test.js
```

If everything shows green ✅, the structure is fine and you can drop it into the real project. If anything shows ❌ FAIL, the line below it will show the exact reason (missing key/file).

## When Placing It Into the Real Project
1. `Test/index.js` → replace the real project's root `index.js`
2. `Test/config.json` → replace/merge with the real project's root `config.json` (add the `"language"` key alongside your existing e2ee/other settings)
3. `Test/Language/index.json` → create a `Language/` folder in the real project's root and place it there

Then start the bot and check the console for the log messages.
