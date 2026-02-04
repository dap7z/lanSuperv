/* Execution :
*  -> npm run build
*  -> npm run dev //for non-minified
*/

const path = require('path');

module.exports = {
    entry: './front/src/js/index.js',
    output: {
        path: path.resolve(__dirname + '/front/dist'),
        filename: 'bundle.js',
    },
    node: {
        __dirname: false,
        __filename: false
    },
    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.esm-bundler.js'
        },
        extensions: ['.js', '.vue', '.json']
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    }
};