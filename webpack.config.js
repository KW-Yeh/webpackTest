const path = require('path');
const fs = require('fs');

// plugin
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const manifestPath = path.resolve(__dirname, 'manifest.json');

class ManifestPlugin {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('ManifestPlugin', (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: 'ManifestPlugin',
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                },
                () => {
                    const manifest = fs.readFileSync(manifestPath);
                    compilation.emitAsset('manifest.json', new compiler.webpack.sources.RawSource(manifest));
                }
            );
        });
    }
}

module.exports = (env, argv = {}) => {
    const mode = argv.mode || 'development';
    const isDevelopment = mode === 'development';

    return {
        mode,
        entry: './src/index.jsx',
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: isDevelopment ? 'static/js/[name].js' : 'static/js/[name].[contenthash:8].js',
            chunkFilename: isDevelopment ? 'static/js/[name].chunk.js' : 'static/js/[name].[contenthash:8].chunk.js',
            clean: true,
        },
        module: {
            rules: [
                {
                    test: /\.(js|jsx)?$/,
                    exclude: /node_modules/,
                    use: [{
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                "@babel/preset-env",
                                "@babel/preset-react"
                            ],
                        }
                    }]
                },
                {
                    test: /\.(sa|sc|c)ss$/,
                    use: [
                        isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
                        'css-loader',
                        'sass-loader'
                    ],
                },
                {
                    test: /\.(woff2?|ttf)$/,
                    type: 'asset/resource',
                    generator: { filename: 'static/fonts/[name][ext]' }
                },
            ]
        },
        devServer: {
            historyApiFallback: true,
            port: 8080
        },
        optimization: {
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        output: {
                            comments: false
                        }
                    },
                    extractComments: false
                })
            ]
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: './public/index.html',
                filename: 'index.html',
            }),
            new MiniCssExtractPlugin({
                filename: isDevelopment ? 'static/css/[name].css' : 'static/css/[name].[contenthash:8].css',
                chunkFilename: isDevelopment ? 'static/css/[name].chunk.css' : 'static/css/[name].[contenthash:8].chunk.css',
            }),
            new ManifestPlugin(),
        ],
    };
};
