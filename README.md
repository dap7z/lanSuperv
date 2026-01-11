# lanSuperv
## nodejs lan supervision

![](demo.gif)

### How to install ?
1) Run executable, by example in windows console : "lan-superv.exe --config=D:\SRV_WEB\lanSuperv\config.js"
note : if no --config is specified, it's looks for a "config.js" file in the executable directory
2) Go to http://localhost:842

### How to dev ?
1) Download and install last stable version of node js for windows : 
<br /> https://nodejs.org/en/download
2) Download the application zip and extract it
3) Setup node-gyp requirements (if needed for native modules)
> Node.js 24 LTS is required
> For native modules compilation, install Visual Studio Build Tools or Visual Studio Community
```sh
$ npm config set msvs_version 2015 --global
$ npm install -g node-gyp-install
$ npm install -g node-gyp #(node-gyp have to be installed globaly)
```
4) Install dependencies with the command: "npm install" 
5) Build assets with the command: "npm run dev" (no minified javascript for debug purposes)
6) Copy "config.js.sample" to "config.js" and edit the file
7) Launch application with the command: "npm start"

### How to build ?
1) Do all "How to dev ?" steps
2) Execute "npm install -g pkg"
3) Build application with the command: "npm run build"
4) Run in windows console "lan-superv.exe --config=config.js"

