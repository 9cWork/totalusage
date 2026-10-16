# totalusage

A Claude Code plugin that adds `/totalusage`: total [ccusage](https://github.com/ryoppippi/ccusage) token usage and cost, by category (Input, Output, Cache Create, Cache Read, Total Tokens, Cost).

## Install

```
/plugin marketplace add 9cWork/totalusage
/plugin install totalusage@totalusage
```

Then run `/totalusage`.

## Requirements

Node.js and npm. The server installs `ccusage` globally on first use if it is missing.

## Credits

`ccusage` is a separate third-party project by [ryoppippi](https://github.com/ryoppippi/ccusage) and is not part of this repo. This plugin only wraps its output.
