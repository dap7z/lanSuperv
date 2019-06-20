# lanSuperv
## nodejs lan supervision

How to install ?
<br />
1) Run executable, by example in windows console : "lan-superv.exe --config=config.js"
2) Go to http://localhost:842

How to dev ?
<br />
1) Download and install last stable version of node js for windows : 
<br /> https://nodejs.org/en/download
2) Download the application zip and extract it
3) Setup node-gyp requirements : https://gist.github.com/jtrefry/fd0ea70a89e2c3b7779c
install Visual Studio 2015 Community Edition https://go.microsoft.com/fwlink/?LinkId=532606&clcid=0x409
open it and create a new C++ project to install commons tools + SDK
npm config set msvs_version 2015 --global
npm install -g node-gyp-install
npm install -g node-gyp
(ok with node version 10.8.0 + .npmrc)
4) Install dependencies with the command: "npm install" 
5) Build assets with the command: "npm run dev" (no minified javascript for debug purposes)
6) Copy "config.js.sample" to "config.js" and edit the file
7) Launch application with the command: "npm start"

How to build ?
<br />
1) Do all "How to dev ?" steps
2) Build application with the command: "npm run build"
3) Run in windows console "lan-superv.exe --config=config.js"

