# lanSuperv
## nodejs lan supervision

How to install ?
0) Download and install last stable version of node js for windows : 
<br /> https://nodejs.org/en/download
1) Download and install Nmap software :
<br /> https://nmap.org/download.html
2) Download the application zip and extract it
3) Install dependencies with the command: "npm install"
4) Build assets with the command: "npm run build"
5) Copy "config.js.sample" to "config.js" and edit the file
6) Launch application with the command: "npm start"
7) Go to http://localhost:842


Notes for devs: 
- run "npm run dev" to build no minified javascript for debug purposes
- run "npm publish" and then copy "./dist/win-unpacked/resources/app-update.yml" to "app/dev-app-update.yml"
- build for macOS is supported only on macOS (and untested)
