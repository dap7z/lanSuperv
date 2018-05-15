module.exports.start = function(){

    console.log("HI GATOR");

    const express = require('express');
    const app = express();

    app.get('/', (req, res) => {
        res.send('An alligator approaches!');
    });
    app.get('/exit', (req, res) => {
        process.exit();
    });

    app.listen(842, () => console.log('Gator app listening on port 842!'));


};   //end-module-export