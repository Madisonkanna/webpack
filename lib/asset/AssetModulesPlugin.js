/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Yuta Hiroto @hiroppy
*/

"use strict";

const validateOptions = require("schema-utils");
const { compareModulesByIdentifier } = require("../util/comparators");
const memorize = require("../util/memorize");

/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("../Chunk")} Chunk */
/** @typedef {import("../Compiler")} Compiler */
/** @typedef {import("../Module")} Module */

const getGeneratorSchema = memorize(() =>
	require("../../schemas/plugins/AssetModulesPluginGenerator.json")
);

const getGeneratorSchemaMap = {
	asset: getGeneratorSchema,
	"asset/resource": memorize(() => {
		const base = getGeneratorSchema();
		return {
			...base,
			properties: {
				...base.properties,
				dataUrl: false
			}
		};
	}),
	"asset/inline": memorize(() => {
		const base = getGeneratorSchema();
		return {
			...base,
			properties: {
				...base.properties,
				filename: false
			}
		};
	})
};

const getParserSchema = memorize(() =>
	require("../../schemas/plugins/AssetModulesPluginParser.json")
);
const getAssetGenerator = memorize(() => require("./AssetGenerator"));
const getAssetParser = memorize(() => require("./AssetParser"));
const getAssetSourceGenerator = memorize(() =>
	require("./AssetSourceGenerator")
);

const type = "asset";
const plugin = "AssetModulesPlugin";

class AssetModulesPlugin {
	/**
	 * @param {Compiler} compiler webpack compiler
	 * @returns {void}
	 */
	apply(compiler) {
		compiler.hooks.compilation.tap(
			plugin,
			(compilation, { normalModuleFactory }) => {
				normalModuleFactory.hooks.createParser
					.for("asset")
					.tap(plugin, parserOptions => {
						validateOptions(getParserSchema(), parserOptions, {
							name: "Asset Modules Plugin",
							baseDataPath: "parser"
						});

						let dataUrlCondition = parserOptions.dataUrlCondition;
						if (!dataUrlCondition || typeof dataUrlCondition === "object") {
							dataUrlCondition = {
								maxSize: 8096,
								...dataUrlCondition
							};
						}

						const AssetParser = getAssetParser();

						return new AssetParser(dataUrlCondition);
					});
				normalModuleFactory.hooks.createParser
					.for("asset/inline")
					.tap(plugin, parserOptions => {
						const AssetParser = getAssetParser();

						return new AssetParser(true);
					});
				normalModuleFactory.hooks.createParser
					.for("asset/resource")
					.tap(plugin, parserOptions => {
						const AssetParser = getAssetParser();

						return new AssetParser(false);
					});
				normalModuleFactory.hooks.createParser
					.for("asset/source")
					.tap(plugin, parserOptions => {
						const AssetParser = getAssetParser();

						return new AssetParser(false);
					});

				for (const type of ["asset", "asset/inline", "asset/resource"]) {
					normalModuleFactory.hooks.createGenerator
						.for(type)
						// eslint-disable-next-line no-loop-func
						.tap(plugin, generatorOptions => {
							validateOptions(getGeneratorSchemaMap[type](), generatorOptions, {
								name: "Asset Modules Plugin",
								baseDataPath: "generator"
							});

							let dataUrl = undefined;
							if (type !== "asset/resource") {
								dataUrl = generatorOptions.dataUrl;
								if (!dataUrl || typeof dataUrl === "object") {
									dataUrl = {
										encoding: "base64",
										mimetype: undefined,
										...dataUrl
									};
								}
							}

							let filename = undefined;
							if (type !== "asset/inline") {
								filename = generatorOptions.filename;
							}

							const AssetGenerator = getAssetGenerator();

							return new AssetGenerator(compilation, dataUrl, filename);
						});
				}
				normalModuleFactory.hooks.createGenerator
					.for("asset/source")
					.tap(plugin, () => {
						const AssetSourceGenerator = getAssetSourceGenerator();

						return new AssetSourceGenerator();
					});

				compilation.hooks.renderManifest.tap(plugin, (result, options) => {
					const { chunkGraph } = compilation;
					const { chunk, runtimeTemplate, codeGenerationResults } = options;

					const { outputOptions } = runtimeTemplate;

					const modules = chunkGraph.getOrderedChunkModulesIterableBySourceType(
						chunk,
						"asset",
						compareModulesByIdentifier
					);
					if (modules) {
						for (const module of modules) {
							const filename = module.nameForCondition();
							const filenameTemplate =
								module.buildInfo.assetFilename ||
								outputOptions.assetModuleFilename;

							result.push({
								render: () =>
									codeGenerationResults.get(module).sources.get(type),
								filenameTemplate,
								pathOptions: {
									module,
									filename,
									chunkGraph
								},
								auxiliary: true,
								identifier: `assetModule${chunkGraph.getModuleId(module)}`,
								hash: chunkGraph.getModuleHash(module)
							});
						}
					}

					return result;
				});
			}
		);
	}
}

module.exports = AssetModulesPlugin;
