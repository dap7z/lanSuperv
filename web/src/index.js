/* To compile in /dist folder, open cmd and run :
  cd lanSuperv
  npm run build
  
(or: "npm run dev", both commands writed in package.json)
*/ 

const arr = [1, 2, 3];
const iAmJavascriptES6 = () => console.log(...arr);
window.iAmJavascriptES6 = iAmJavascriptES6;