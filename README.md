# code-jump README

## Features
1. Direct jump function reference.
2. Jump to the next reference found.
3. Jump to the prev reference found.

## Requirements
The system needs to install ripgrep.

https://github.com/BurntSushi/ripgrep/releases

eg:
ubuntu x64:
1. wget https://github.com/BurntSushi/ripgrep/releases/download/12.1.1/ripgrep-12.1.1-x86_64-unknown-linux-musl.tar.gz
2. tar xf ripgrep-12.1.1-x86_64-unknown-linux-musl.tar.gz
3. cp ripgrep-12.1.1-x86_64-unknown-linux-musl/rg /usr/bin/

## Extension Settings
* `code jump.rgPath`: ripgrep path

## Known Issues
Only supports linux and wsl

## Release Notes
### 1.0.0
Initial release of ...

### 1.1.0
Show activitybar view

### 1.1.6
Support lua

### 1.1.7
Integrate linux ripgrep-12.1.1-x86_64 by default

### 1.2.1
1. Support click to select result
2. Add icon to the result