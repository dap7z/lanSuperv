module.exports.create = function(options, callback){

    let workers = [];
    let workersPaths = ['./server-mock.js'];
    //let workersPaths = ['./server.js'];

    function startWorker(workerPath){
        console.log('start workers '+ workerPath);
        return require('child_process').fork(workerPath);
    };

    // Fork worker as child process :
    nbWorkers = workersPaths.length;
    for (var i=0 ; i<nbWorkers ; i++) {

        var startCustom =  startWorker.bind(null, workersPaths[i]);

        workers[i] = startCustom();
        workers[i].on('close', startCustom);
        workers[i].on('error', startCustom);
    }


    //Callback:
    if(typeof callback === 'function') {
        callback(cluster);
    }

};


