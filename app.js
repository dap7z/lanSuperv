var cluster = require("cluster");

//source (and dynamic code) :
//https://stackoverflow.com/questions/20568825/node-js-worker-with-differents-code-in-cluster

if(cluster.isMaster){

    // Forking Workers
    var workerWeb = cluster.fork({WorkerName: "workerWeb"});
    //----
    // Receive messages from this worker and handle them in the master process.
    workerWeb.on('message', function(data) {
        //redirect worker message to main.js :
        process.send(data);
    });
    /*
        // Send a message from the master process to the worker.
        workerWeb.send({msgFromMaster: 'This is from master to worker ' + worker.pid + '.'});
    */
    //----


    //var worker2 = cluster.fork({WorkerName: "worker2"});

    // Respawn if one of both exits
    cluster.on("exit", function(worker, code, signal){
        if(worker==workerWeb) workerWeb = cluster.fork({WorkerName: "workerWeb"});
        // if(worker==worker2) worker2 = cluster.fork({WorkerName: "worker2"});
    });




} else {

    switch(process.env.WorkerName){
        case "workerWeb" :
            // Code of workerWeb
            require('./server').start();
            /*
                process.on('message', function(msg) {
                    console.log('workerWeb received message from master.', msg);
                });
            */
            break;
        // case "worker2" :
        //     // Code of Worker2
        //
        //     break;
        default:
            console.log("no worker named '"+ process.env.WorkerName +"'");
    }

}