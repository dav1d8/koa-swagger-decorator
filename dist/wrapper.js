"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_router_1 = __importDefault(require("koa-router"));
const ramda_1 = __importDefault(require("ramda"));
const is_type_of_1 = __importDefault(require("is-type-of"));
const validate_1 = __importDefault(require("./validate"));
const swaggerHTML_1 = require("./swaggerHTML");
const swaggerJSON_1 = require("./swaggerJSON");
const swaggerObject_1 = __importDefault(require("./swaggerObject"));
const utils_1 = require("./utils");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const validator = (parameters) => (ctx, next) => __awaiter(this, void 0, void 0, function* () {
    if (!parameters) {
        yield next();
        return;
    }
    if (parameters.query) {
        ctx.validatedQuery = validate_1.default(ctx.request.query, parameters.query);
    }
    if (parameters.path) {
        ctx.validatedParams = validate_1.default(ctx.params, parameters.path);
    }
    if (parameters.body) {
        ctx.validatedBody = validate_1.default(ctx.request.body, parameters.body);
    }
    yield next();
});
const handleDumpSwaggerJSON = (router, dumpOptions, options = {}) => {
    let data = {};
    const { dir = process.cwd(), filename = 'swagger.json' } = dumpOptions;
    Object.keys(swaggerObject_1.default.data).forEach((k) => {
        if (router.swaggerKeys.has(k)) {
            data[k] = swaggerObject_1.default.data[k];
        }
    });
    console.log(path_1.default.resolve(dir, filename));
    const jsonData = swaggerJSON_1.swaggerJSON(options, data);
    fs_1.writeFileSync(path_1.default.resolve(dir, filename), JSON.stringify(jsonData, null, 2));
};
const handleSwagger = (router, options) => {
    const { swaggerJsonEndpoint = '/swagger-json', swaggerHtmlEndpoint = '/swagger-html', prefix = '', swaggerConfiguration = {}, } = options;
    // setup swagger router
    router.get(swaggerJsonEndpoint, (ctx) => __awaiter(this, void 0, void 0, function* () {
        let data = {};
        if (router instanceof SwaggerRouter) {
            Object.keys(swaggerObject_1.default.data).forEach(k => {
                if (router.swaggerKeys.has(k)) {
                    data[k] = swaggerObject_1.default.data[k];
                }
            });
        }
        else {
            // 兼容使用 wrapper 的情况
            data = swaggerObject_1.default.data;
        }
        ctx.body = swaggerJSON_1.swaggerJSON(options, data);
    }));
    router.get(swaggerHtmlEndpoint, (ctx) => __awaiter(this, void 0, void 0, function* () {
        ctx.body = swaggerHTML_1.swaggerHTML(utils_1.getPath(prefix, swaggerJsonEndpoint), swaggerConfiguration);
    }));
};
const handleMap = (router, SwaggerClass, { doValidation = true }) => {
    if (!SwaggerClass)
        return;
    const classMiddlewares = SwaggerClass.middlewares || [];
    const classPrefix = SwaggerClass.prefix || '';
    const classParameters = SwaggerClass.parameters || {};
    const classParametersFilters = SwaggerClass.parameters
        ? SwaggerClass.parameters.filters
        : ['ALL'];
    classParameters.query = classParameters.query ? classParameters.query : {};
    const staticMethods = Object.getOwnPropertyNames(SwaggerClass)
        .filter(method => !utils_1.reservedMethodNames.includes(method))
        .map((method) => {
        const func = SwaggerClass[method];
        func['fnName'] = method;
        return func;
    });
    const SwaggerClassPrototype = SwaggerClass.prototype;
    const methods = Object.getOwnPropertyNames(SwaggerClassPrototype)
        .filter((method) => !utils_1.reservedMethodNames.includes(method))
        .map((method) => {
        const wrapperMethod = (ctx) => __awaiter(this, void 0, void 0, function* () {
            const c = new SwaggerClass(ctx);
            yield c[method](ctx);
        });
        // 添加了一层 wrapper 之后，需要把原函数的名称暴露出来 fnName
        // wrapperMethod 继承原函数的 descriptors
        const descriptors = Object.getOwnPropertyDescriptors(SwaggerClassPrototype[method]);
        Object.defineProperties(wrapperMethod, Object.assign({ fnName: {
                value: method,
                enumerable: true,
                writable: true,
                configurable: true,
            } }, descriptors));
        return wrapperMethod;
    });
    // map all methods
    [...staticMethods, ...methods]
        // filter methods withour @request decorator
        .filter((item) => {
        const { path, method } = item;
        if (!path && !method) {
            return false;
        }
        return true;
    })
        // add router
        .forEach((item) => {
        router._addKey(`${SwaggerClass.name}-${item.fnName}`);
        const { path, method } = item;
        let { middlewares = [] } = item;
        const localParams = item.parameters || {};
        if (classParametersFilters.includes('ALL') ||
            classParametersFilters.map(i => i.toLowerCase()).includes(method)) {
            const globalQuery = ramda_1.default.clone(classParameters.query);
            localParams.query = localParams.query ? localParams.query : {};
            // merge local query and class query
            // local query 的优先级更高
            localParams.query = Object.assign(globalQuery, localParams.query);
        }
        if (is_type_of_1.default.function(middlewares)) {
            middlewares = [middlewares];
        }
        if (!is_type_of_1.default.array(middlewares)) {
            throw new Error('middlewares params must be an array or function');
        }
        middlewares.forEach((item) => {
            if (!is_type_of_1.default.function(item)) {
                throw new Error('item in middlewares must be a function');
            }
        });
        if (!utils_1.allowedMethods.hasOwnProperty(method.toUpperCase())) {
            throw new Error(`illegal API: ${method} ${path} at [${item}]`);
        }
        const chain = [`${utils_1.convertPath(`${classPrefix}${path}`)}`];
        if (doValidation) {
            chain.push(validator(localParams));
        }
        chain.push(...classMiddlewares);
        chain.push(...middlewares);
        chain.push(item);
        router[method](...chain);
    });
};
const handleMapDir = (router, dir, options) => {
    utils_1.loadSwaggerClasses(dir, options).forEach((c) => {
        router.map(c, options);
    });
};
const wrapper = (router) => {
    router.swagger = (options = {}) => {
        handleSwagger(router, options);
    };
    router.map = (SwaggerClass, options = {}) => {
        handleMap(router, SwaggerClass, options);
    };
    router.mapDir = (dir, options = {}) => {
        handleMapDir(router, dir, options);
    };
};
exports.wrapper = wrapper;
class SwaggerRouter extends koa_router_1.default {
    constructor(opts = {}, swaggerOpts = {}) {
        super(opts);
        this.opts = opts || {}; // koa-router opts
        this.swaggerKeys = new Set();
        this.swaggerOpts = swaggerOpts || {}; // swagger-router opts
        if (this.opts.prefix && !this.swaggerOpts.prefix) {
            this.swaggerOpts.prefix = this.opts.prefix;
        }
    }
    _addKey(str) {
        this.swaggerKeys.add(str);
    }
    swagger(options = {}) {
        const opts = Object.assign(options, this.swaggerOpts);
        handleSwagger(this, opts);
    }
    dumpSwaggerJson(dumpOptions, options = {}) {
        const opts = Object.assign(options, this.swaggerOpts);
        handleDumpSwaggerJSON(this, dumpOptions, opts);
    }
    map(SwaggerClass, options) {
        handleMap(this, SwaggerClass, options);
    }
    mapDir(dir, options = {}) {
        handleMapDir(this, dir, options);
    }
}
exports.SwaggerRouter = SwaggerRouter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi93cmFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFDQSw0REFBZ0M7QUFDaEMsa0RBQXNCO0FBQ3RCLDREQUE0QjtBQUM1QiwwREFBa0M7QUFDbEMsK0NBQTRDO0FBQzVDLCtDQUE0QztBQUM1QyxvRUFBNEM7QUFDNUMsbUNBTWlCO0FBRWpCLDJCQUFtQztBQUNuQyxnREFBd0I7QUFReEIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxVQUFlLEVBQUUsRUFBRSxDQUFDLENBQ3JDLEdBQVksRUFDWixJQUF3QixFQUN4QixFQUFFO0lBQ0YsSUFBSSxDQUFDLFVBQVUsRUFBRTtRQUNmLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFDYixPQUFPO0tBQ1I7SUFFRCxJQUFJLFVBQVUsQ0FBQyxLQUFLLEVBQUU7UUFDcEIsR0FBRyxDQUFDLGNBQWMsR0FBRyxrQkFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztLQUNwRTtJQUNELElBQUksVUFBVSxDQUFDLElBQUksRUFBRTtRQUNuQixHQUFHLENBQUMsZUFBZSxHQUFHLGtCQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDN0Q7SUFDRCxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUU7UUFDbkIsR0FBRyxDQUFDLGFBQWEsR0FBRyxrQkFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNqRTtJQUNELE1BQU0sSUFBSSxFQUFFLENBQUM7QUFDZixDQUFDLENBQUEsQ0FBQztBQXFDRixNQUFNLHFCQUFxQixHQUFHLENBQzVCLE1BQXFCLEVBQ3JCLFdBQXdCLEVBQ3hCLFVBQTBCLEVBQUUsRUFDNUIsRUFBRTtJQUNGLElBQUksSUFBSSxH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