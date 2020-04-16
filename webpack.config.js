const path = require('path');
module.exports = {
	//mode: 'development', 
	mode: 'production',
	entry: {
		treemap: './ts/treemap.ts',
		line: './ts/line.ts'
	},
	output: {
		path: path.join(__dirname, 'www/js'),
		filename: '[name].js'
	},
	resolve: {
		extensions: ['.ts', '.js'],
		alias: {
			'vue$': 'vue/dist/vue.esm.js'
		}
	},
	module: {
		rules: [
			{
				// 拡張子が.tsで終わるファイルに対して、TypeScriptコンパイラを適用する
				test: /\.ts$/, loader: 'ts-loader'
			}
		]
	}
}
