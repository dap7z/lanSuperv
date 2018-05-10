const config = {
  entry: {
    index: './web/src/index.js'
  },
  output: {
    filename: '[name].js',
    path: __dirname + '/web/dist'
  },
  node: {
    __dirname: false,
    __filename: false
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader"
        }
      }
    ]
  }
};
module.exports = config;

/****************************************
The concept of zero configuration in webpack 4 applies to:

the entry point. Default to ./src/index.js
the output. Default to ./dist/main.js
production and development mode (no need to create 2 separate confs for production and development)

But for using loaders in webpack 4 you still have to create a configuration file.
****************************************/