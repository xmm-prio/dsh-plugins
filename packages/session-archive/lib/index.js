// ../../node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// ../../node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve3) {
  resolvers[type] = resolve3;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/config.ts
var Config = Schema.object({
  sessionRoot: Schema.string().description("\u4F1A\u8BDD\u65E5\u5FD7\u6839\u76EE\u5F55\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4EC5\u5728\u540E\u7AEF\u62D2\u7EDD\u7ED9\u51FA\u65E5\u5FD7\u8DEF\u5F84\u65F6\u9700\u8981\u586B\u5199\u3002")
}).description("\u4F1A\u8BDD\u5F52\u6863\u533A");

// src/host/errors.ts
var KNOWN = {
  unknownSession: "WorkspaceUnknownSessionError",
  alreadyOwned: "SessionAlreadyOwnedError",
  formatUnsupported: "SessionFormatUnsupportedError"
};
function named(error, name2) {
  return error instanceof Error && error.name === name2;
}
function isUnknownSessionError(error) {
  return named(error, KNOWN.unknownSession);
}
function isAlreadyOwnedError(error) {
  return named(error, KNOWN.alreadyOwned);
}
function isFormatUnsupportedError(error) {
  return named(error, KNOWN.formatUnsupported);
}
function describeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/host/internals/agent-effects.ts
var EFFECT_SYMBOL = Symbol.for("cordis.effect");
var LIFECYCLE_PREFIX = "agentLoop.lifecycle(";
function agentLifecycleLabel(sessionId) {
  return `${LIFECYCLE_PREFIX}${sessionId})`;
}
function sessionIdFromLifecycleLabel(label) {
  if (!label.startsWith(LIFECYCLE_PREFIX) || !label.endsWith(")")) return void 0;
  return label.slice(LIFECYCLE_PREFIX.length, -1);
}
function labelOf(disposable) {
  if (typeof disposable !== "function") return void 0;
  const meta = disposable[EFFECT_SYMBOL];
  if (typeof meta !== "object" || meta === null) return void 0;
  const label = meta.label;
  return typeof label === "string" ? label : void 0;
}
function scanLabelledEffects(registry) {
  const found = [];
  for (const runtime of registry.values()) {
    const fibers = runtime.fibers;
    if (fibers === void 0) continue;
    for (const fiber of fibers) {
      const disposables = fiber._disposables;
      if (disposables === void 0) continue;
      for (const disposable of disposables) {
        const label = labelOf(disposable);
        if (label !== void 0) found.push({ label, wrapper: disposable });
      }
    }
  }
  return found;
}
function findAgentLifecycleEffects(registry, sessionId) {
  const label = agentLifecycleLabel(sessionId);
  return scanLabelledEffects(registry).filter((effect) => effect.label === label);
}
function listLiveAgentSessionIds(registry) {
  const ids = /* @__PURE__ */ new Set();
  for (const effect of scanLabelledEffects(registry)) {
    const id = sessionIdFromLifecycleLabel(effect.label);
    if (id !== void 0) ids.add(id);
  }
  return [...ids];
}
async function runEffectDisposer(effect) {
  await effect.wrapper();
}
function probeEffectScan(registry) {
  if (typeof registry !== "object" || registry === null) return false;
  const values = registry.values;
  if (typeof values !== "function") return false;
  try {
    const iterated = registry.values();
    if (typeof iterated[Symbol.iterator] !== "function") return false;
    for (const runtime of iterated) {
      const fibers = runtime.fibers;
      if (fibers === void 0) continue;
      if (typeof fibers[Symbol.iterator] !== "function") return false;
      for (const fiber of fibers) {
        const disposables = fiber._disposables;
        if (disposables === void 0) return false;
        if (typeof disposables[Symbol.iterator] !== "function") return false;
        return true;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// src/host/outcome.ts
function failure(id, code, detail) {
  return { id, ok: false, code, detail };
}
function success(id) {
  return { id, ok: true };
}

// src/host/rejection-watch.ts
async function watchingRejections(operation, subject, logger, proc = process) {
  const listener = (reason) => {
    const detail = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    logger.error(
      `session-archive: unhandled rejection while tearing down ${subject()}; DSH treats any unhandled rejection as fatal and is about to exit.
${detail}`
    );
  };
  proc.prependListener("unhandledRejection", listener);
  try {
    return await operation();
  } finally {
    proc.off("unhandledRejection", listener);
  }
}

// src/host/agent-teardown.ts
var TeardownShapeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TeardownShapeError";
  }
};
var AgentTeardown = class {
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * Teardowns currently running, keyed by SessionId.
   *
   * The cordis effect wrapper is not externally memoized: a second call returns
   * `undefined` rather than a joinable thenable, so concurrent callers have to
   * be collapsed here.
   */
  inFlight = /* @__PURE__ */ new Map();
  /**
   * Sessions whose lifecycle effect this plugin has already consumed.
   *
   * A cordis effect is single-shot. Once its disposer has run the effect is
   * gone from the fiber tree, so a session whose teardown failed to deregister
   * its agent afterwards looks identical to one whose label convention changed.
   * Remembering which effects were spent tells those two apart.
   */
  spent = /* @__PURE__ */ new Set();
  /** The session being torn down right now, for rejection attribution. */
  subject = "nothing";
  /**
   * Sessions that can be shut down.
   *
   * Root agents only: a subagent is torn down by the parent it belongs to, and
   * offering it as its own target invites exactly the ownership violation the
   * cascade exists to avoid. The effect-label scan is the fallback for a
   * profile that does not mount `ctx.agents`, where no agent can exist anyway.
   *
   * @returns the session ids with a live root agent.
   */
  runningSessionIds() {
    const { agents } = this.deps;
    if (agents === void 0) return listLiveAgentSessionIds(this.deps.registry);
    return agents.roots().map((agent) => agent.id);
  }
  /**
   * Dispose one session's agent, if it has one.
   * @param sessionId - the session to stop.
   * @returns whether a live agent was actually torn down.
   * @throws {TeardownShapeError} when liveness and the effect labels disagree,
   *   or when the disposer finished with the agent still registered.
   */
  async teardown(sessionId) {
    const running = this.inFlight.get(sessionId);
    if (running !== void 0) return running;
    const attempt = this.dispose(sessionId).finally(() => {
      this.inFlight.delete(sessionId);
    });
    this.inFlight.set(sessionId, attempt);
    return attempt;
  }
  /**
   * Dispose the named sessions, reporting each one separately.
   *
   * One failure never stops the rest: the point of the action is to release
   * background resources, and a stuck session must not hold the others hostage.
   *
   * The whole batch runs under rejection attribution, because this is the one
   * operation in the plugin that can take the harness down with it.
   *
   * @param sessionIds - the sessions to stop; an id with no live agent reports
   *   success, since the requested end state already holds.
   * @returns one outcome per requested session, in request order.
   */
  async teardownEach(sessionIds) {
    return watchingRejections(
      async () => {
        const outcomes = [];
        for (const id of sessionIds) {
          this.subject = `session "${id}"`;
          try {
            await this.teardown(id);
            outcomes.push(success(id));
          } catch (error) {
            outcomes.push(failure(id, "teardown-effect-missing", describeError(error)));
          }
        }
        return outcomes;
      },
      () => this.subject,
      this.deps.logger,
      this.deps.process
    );
  }
  async dispose(sessionId) {
    const { agents, registry } = this.deps;
    const effects = findAgentLifecycleEffects(registry, sessionId);
    if (effects.length > 1) {
      throw new TeardownShapeError(
        `${String(effects.length)} lifecycle effects carry session "${sessionId}"; refusing to guess which one to dispose`
      );
    }
    if (effects.length === 0) {
      if (agents?.get(sessionId) === void 0) return { kind: "not-running" };
      throw new TeardownShapeError(
        this.spent.has(sessionId) ? `session "${sessionId}" stayed registered after its lifecycle effect was disposed; it cannot be torn down twice` : `session "${sessionId}" has a live agent but no "agentLoop.lifecycle" effect; the host's effect labels changed`
      );
    }
    this.spent.add(sessionId);
    await runEffectDisposer(effects[0]);
    if (agents?.get(sessionId) !== void 0) {
      throw new TeardownShapeError(
        `disposed the lifecycle effect of session "${sessionId}" but its agent is still registered`
      );
    }
    return { kind: "disposed" };
  }
};

// src/domain/session-id.ts
var MAX_SESSION_ID_LENGTH = 255;
function validateSessionId(value) {
  if (value.length === 0) return "empty";
  if (value.length > MAX_SESSION_ID_LENGTH) return "too-long";
  if (value.includes("\0")) return "nul";
  if (value.includes("/") || value.includes("\\")) return "path-separator";
  if (value === "." || value === "..") return "dot-segment";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "control-character";
  if (/^[A-Za-z]:/.test(value)) return "drive-letter";
  return void 0;
}

// src/host/internals/workspace-state.ts
var WORKSPACE_DOMAIN = "workspace";
function readWorkspaceDomainState(facility) {
  if (facility === void 0 || typeof facility.get !== "function") {
    return { ok: false, reason: "domain-facility-unavailable" };
  }
  let handle;
  try {
    handle = facility.get(WORKSPACE_DOMAIN);
  } catch {
    return { ok: false, reason: "domain-not-open" };
  }
  if (handle === void 0 || typeof handle.global?.get !== "function" || typeof handle.global.set !== "function") {
    return { ok: false, reason: "domain-not-open" };
  }
  let value;
  try {
    value = handle.global.get();
  } catch {
    return { ok: false, reason: "global-unreadable" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "state-malformed" };
  }
  const archived = value["archivedSessionIds"];
  if (!Array.isArray(archived) || archived.some((id) => typeof id !== "string")) {
    return { ok: false, reason: "state-malformed" };
  }
  return { ok: true, state: value };
}
function withoutArchived(state, removed) {
  const drop = new Set(removed);
  const present = state.archivedSessionIds.filter((id) => drop.has(id));
  return {
    next: { ...state, archivedSessionIds: state.archivedSessionIds.filter((id) => !drop.has(id)) },
    dropped: present
  };
}
function probePrivateWritePath(registry) {
  const candidate = registry;
  if (typeof candidate.enqueueOperation !== "function") {
    return { ok: false, subject: "workspaceRegistry.enqueueOperation" };
  }
  const state = candidate.state;
  if (typeof state !== "object" || state === null || !Array.isArray(state.archivedSessionIds)) {
    return { ok: false, subject: "workspaceRegistry.state" };
  }
  return { ok: true };
}
function enqueueRegistryOperation(registry, operation) {
  return registry.enqueueOperation(operation);
}
function backfillRegistryState(registry, next) {
  ;
  registry.state = next;
}
async function writeWorkspaceDomainState(facility, next) {
  const handle = facility.get(WORKSPACE_DOMAIN);
  if (handle === void 0) throw new Error("session-archive: workspace storage domain closed mid-write");
  await handle.global.set(next);
}

// src/host/archive-writer.ts
var ArchiveWriter = class {
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * The current archive set.
   *
   * Read through the registry's public getter rather than the storage domain:
   * the domain would answer with whatever is in memory right now, including a
   * value written half-way through someone else's queued operation.
   *
   * @returns the archived session ids.
   */
  archived() {
    return this.deps.registry.archivedSessionIds;
  }
  /**
   * Add sessions to the archive set, one at a time.
   *
   * Sequential on purpose: each `archiveSession` is a durable global write that
   * fans out to every connected browser, so a parallel batch would produce a
   * push storm for no gain. The host call is idempotent and independent of
   * workspace membership.
   *
   * @param ids - sessions to archive.
   * @returns one outcome per id, in input order.
   */
  async archive(ids) {
    const outcomes = [];
    for (const id of ids) {
      const invalid = validateSessionId(id);
      if (invalid !== void 0) {
        outcomes.push(failure(id, "invalid-session-id", invalid));
        continue;
      }
      try {
        await this.deps.registry.archiveSession(id);
        outcomes.push({ id, ok: true });
      } catch (error) {
        outcomes.push(
          isUnknownSessionError(error) ? failure(id, "unknown-session", describeError(error)) : failure(id, "host-error", describeError(error))
        );
      }
    }
    return outcomes;
  }
  /**
   * Remove sessions from the archive set.
   *
   * The whole batch is one operation on the registry's own mutex chain, so it
   * cannot interleave with an official `archiveSession`, and
   * `enqueueOperation` runs `recoverPendingMutation()` first — a private queue
   * would silently skip that recovery.
   *
   * A read that fails is never treated as an empty set: spreading `{}` back
   * over the global record would erase `workspaceIds`.
   *
   * @param ids - sessions to remove from the archive set.
   * @returns one outcome per id, in input order.
   */
  async unarchive(ids) {
    const invalid = /* @__PURE__ */ new Map();
    const candidates = [];
    for (const id of ids) {
      const rejection = validateSessionId(id);
      if (rejection === void 0) candidates.push(id);
      else invalid.set(id, rejection);
    }
    let dropped;
    try {
      dropped = new Set(await this.dropFromArchiveSet(candidates));
    } catch (error) {
      return ids.map(
        (id) => invalid.has(id) ? failure(id, "invalid-session-id", invalid.get(id)) : failure(id, "archive-set-unreadable", describeError(error))
      );
    }
    return ids.map((id) => {
      if (invalid.has(id)) return failure(id, "invalid-session-id", invalid.get(id));
      if (dropped.has(id)) return { id, ok: true };
      return failure(id, "not-archived", "the session is not in the archive set");
    });
  }
  /**
   * The archive-set write itself, shared by unarchive and the last step of a delete.
   * @param ids - sessions to remove.
   * @returns the ids that were actually in the set.
   * @throws when the domain cannot be read; nothing is written in that case.
   */
  async dropFromArchiveSet(ids) {
    if (ids.length === 0) return [];
    const { registry, storageDomain } = this.deps;
    return enqueueRegistryOperation(registry, async () => {
      const read = readWorkspaceDomainState(storageDomain);
      if (!read.ok) throw new Error(`workspace storage domain unreadable (${read.reason}); refusing to write`);
      const { next, dropped } = withoutArchived(read.state, ids);
      if (dropped.length === 0) return dropped;
      await writeWorkspaceDomainState(storageDomain, next);
      backfillRegistryState(registry, next);
      return dropped;
    });
  }
};

// src/host/internals/jsonl-backend.ts
import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve as resolve2 } from "node:path";

// src/domain/fs-guard.ts
var SEPARATORS = /[\\/]+/;
function splitSegments(tail) {
  return tail.split(SEPARATORS).filter((segment) => segment.length > 0);
}
function parseAbsolutePath(value) {
  if (value.length === 0) return void 0;
  let rest = value;
  let extended = false;
  if (/^[\\/]{2}[?.][\\/]/.test(rest)) {
    rest = rest.slice(4);
    extended = true;
  }
  const uncPrefix = extended ? /^UNC[\\/]+([^\\/]+)[\\/]+([^\\/]+)/i : /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/;
  const unc = uncPrefix.exec(rest);
  if (unc !== null) {
    return {
      flavour: "windows",
      root: `//${unc[1].toLowerCase()}/${unc[2].toLowerCase()}`,
      segments: splitSegments(rest.slice(unc[0].length))
    };
  }
  const drive = /^([A-Za-z]):/.exec(rest);
  if (drive !== null) {
    return { flavour: "windows", root: `${drive[1].toLowerCase()}:`, segments: splitSegments(rest.slice(2)) };
  }
  if (extended) return void 0;
  if (rest.startsWith("/")) return { flavour: "posix", root: "/", segments: splitSegments(rest) };
  return void 0;
}
function fold(flavour, segment) {
  return flavour === "windows" ? segment.toLowerCase() : segment;
}
function isStrictlyInside(parent, child) {
  const outer = parseAbsolutePath(parent);
  const inner = parseAbsolutePath(child);
  if (outer === void 0 || inner === void 0) return false;
  if (outer.flavour !== inner.flavour || outer.root !== inner.root) return false;
  if (inner.segments.length <= outer.segments.length) return false;
  return outer.segments.every((segment, index) => fold(outer.flavour, segment) === fold(inner.flavour, inner.segments[index]));
}
function checkSessionDirectory(check) {
  if (check.sessionId !== void 0 && validateSessionId(check.sessionId) !== void 0) return "invalid-session-id";
  const parsed = parseAbsolutePath(check.dir);
  if (parsed === void 0) return "not-absolute";
  if (parsed.segments.length === 0) return "filesystem-root";
  if (check.root !== void 0 && !isStrictlyInside(check.root, check.dir)) return "outside-root";
  if (parsed.segments.length < 2) return "shallow";
  if (check.sessionId !== void 0 && parsed.segments[parsed.segments.length - 1] !== check.sessionId) {
    return "foreign-basename";
  }
  return void 0;
}

// src/host/internals/jsonl-backend.ts
var JSONL_BACKEND_NAME = "session-persistence-jsonl";
var UNNAMED_BACKEND = "(unnamed)";
var GENERATION_FILE = /^session\.v\d+\.jsonl(?:\.zstd)?$/;
function backendName(persistence) {
  const name2 = persistence?.name;
  return typeof name2 === "string" && name2.length > 0 ? name2 : UNNAMED_BACKEND;
}
function resolveSessionRoot(persistence, configured) {
  const declared = persistence?.config?.root;
  if (typeof declared === "string" && declared.length > 0) {
    return { known: true, path: resolve2(declared), source: "backend-config" };
  }
  if (configured !== void 0 && configured.length > 0) {
    return { known: true, path: resolve2(configured), source: "plugin-config" };
  }
  return {
    known: false,
    reason: `${backendName(persistence)}.config.root is not a string and no sessionRoot is configured`
  };
}
function describeSessionRoot(root) {
  return root.known ? `${root.path} (from ${root.source})` : `unknown: ${root.reason}`;
}
function probeDeletableBackend(persistence) {
  const name2 = backendName(persistence);
  if (name2 !== JSONL_BACKEND_NAME) return { ok: false, missing: "backend", subject: name2 };
  if (typeof persistence.resolveCurrentLog !== "function") {
    return { ok: false, missing: "resolver", subject: `${name2}.resolveCurrentLog` };
  }
  return { ok: true };
}
function unsupportedFormatPath(error) {
  const location = error.location;
  if (typeof location !== "object" || location === null) return void 0;
  const path = location.path;
  return typeof path === "string" && path.length > 0 ? path : void 0;
}
async function locateSessionLog(persistence, sessionId, root) {
  const resolveLog = persistence.resolveCurrentLog;
  if (typeof resolveLog === "function") {
    try {
      const path = await resolveLog.call(persistence, sessionId);
      if (path !== void 0) return { kind: "current", dir: dirname(path) };
    } catch (error) {
      if (!isFormatUnsupportedError(error)) throw error;
      const path = unsupportedFormatPath(error);
      if (path === void 0) throw error;
      return { kind: "unreadable-format", dir: dirname(path), detail: errorMessage(error) };
    }
  }
  const materialized = await persistence.stat(sessionId) !== void 0;
  if (!materialized) return { kind: "absent" };
  if (!root.known) return { kind: "root-unknown", reason: root.reason };
  const candidates = await findSessionDirs(root.path, sessionId);
  if (candidates.length === 0) return { kind: "not-found", root: root.path };
  if (candidates.length > 1) return { kind: "ambiguous", dirs: candidates };
  return { kind: "derived", dir: candidates[0], root: root.path };
}
async function findSessionDirs(root, sessionId) {
  let projects;
  try {
    projects = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  const found = [];
  for (const project of projects) {
    const candidate = join(root, project, sessionId);
    try {
      if ((await stat(candidate)).isDirectory()) found.push(candidate);
    } catch {
      continue;
    }
  }
  return found;
}
async function proveDerivedOwnership(check) {
  const rejection = checkSessionDirectory({ dir: check.dir, sessionId: check.sessionId, root: check.root });
  switch (rejection) {
    case void 0:
      break;
    case "outside-root":
      return "ownership-outside-root";
    case "foreign-basename":
    // An id that cannot address a directory cannot be a directory's name
    // either; `LogRemover` rejects those long before this point.
    case "invalid-session-id":
      return "ownership-basename-mismatch";
    default:
      return "ownership-unsafe-root";
  }
  let contents;
  try {
    contents = await readdir(check.dir);
  } catch {
    return "ownership-generation-missing";
  }
  return contents.some((name2) => GENERATION_FILE.test(name2)) ? void 0 : "ownership-generation-missing";
}
async function probeWriteLeaseReleased(persistence, sessionId) {
  let handle;
  try {
    handle = await persistence.open(sessionId, "write");
  } catch (error) {
    return {
      released: false,
      detail: isAlreadyOwnedError(error) ? `the write lease is still held: ${errorMessage(error)}` : `the write-lease probe could not be evaluated: ${describeError(error)}`
    };
  }
  await closeQuietly(handle);
  return { released: true };
}
async function closeQuietly(handle) {
  if (typeof handle !== "object" || handle === null) return;
  const close = handle.close;
  if (typeof close === "function") {
    await close.call(handle);
    return;
  }
  const dispose = handle[Symbol.asyncDispose];
  if (typeof dispose === "function") await dispose.call(handle);
}

// src/host/capabilities.ts
var AVAILABLE = { available: true };
function blocked(code, subject) {
  return { available: false, code, subject };
}
function probeArchive(surfaces) {
  const registry = surfaces.workspaceRegistry;
  if (registry === void 0) return blocked("workspace-registry-unavailable", "ctx.workspaceRegistry");
  if (typeof registry.archiveSession !== "function") {
    return blocked("archive-api-missing", "workspaceRegistry.archiveSession");
  }
  if (!Array.isArray(registry.archivedSessionIds)) {
    return blocked("archive-api-missing", "workspaceRegistry.archivedSessionIds");
  }
  if (surfaces.persistence === void 0 || typeof surfaces.persistence.list !== "function") {
    return blocked("session-list-unavailable", "sessionPersistence.list");
  }
  return AVAILABLE;
}
function probeUnarchive(surfaces, archive) {
  if (!archive.available) return archive;
  const write = probePrivateWritePath(surfaces.workspaceRegistry);
  if (!write.ok) return blocked("private-write-path-missing", write.subject);
  const read = readWorkspaceDomainState(surfaces.storageDomain);
  if (!read.ok) return blocked("workspace-domain-unavailable", `storageDomain.get('workspace'): ${read.reason}`);
  return AVAILABLE;
}
function probeShutdown(surfaces) {
  if (!probeEffectScan(surfaces.registry)) return blocked("fiber-scan-unavailable", "ctx.registry fibers");
  const agents = surfaces.agents;
  if (agents !== void 0 && typeof agents.roots !== "function") {
    return blocked("agent-roots-unavailable", "agents.roots");
  }
  return AVAILABLE;
}
function probeDelete(surfaces, shutdown, unarchive) {
  if (!shutdown.available) return shutdown;
  if (surfaces.persistence === void 0) return blocked("session-list-unavailable", "ctx.sessionPersistence");
  const backend = probeDeletableBackend(surfaces.persistence);
  if (!backend.ok) {
    return backend.missing === "backend" ? blocked("persistence-backend-unsupported", backend.subject) : blocked("log-resolver-missing", backend.subject);
  }
  if (!unarchive.available) return unarchive;
  return AVAILABLE;
}
function probeDeleteLegacy(surfaces, remove) {
  if (!remove.available) return remove;
  const root = surfaces.sessionRoot;
  return root.known ? AVAILABLE : blocked("log-root-unknown", root.reason);
}
function probeMetadata(surfaces) {
  if (surfaces.persistence === void 0 || typeof surfaces.persistence.list !== "function") {
    return blocked("session-list-unavailable", "sessionPersistence.list");
  }
  const cache = surfaces.projectionCache;
  if (typeof cache !== "object" || cache === null || typeof cache.cachedSnapshot !== "function") {
    return blocked("projection-cache-unavailable", "sessionProjectionCache.cachedSnapshot");
  }
  return AVAILABLE;
}
function allBlocked(code, subject) {
  const status = blocked(code, subject);
  const ids = ["archive", "unarchive", "delete", "deleteLegacy", "shutdown", "metadata"];
  return Object.fromEntries(ids.map((id) => [id, status]));
}
function probeCapabilities(surfaces) {
  try {
    const archive = probeArchive(surfaces);
    const unarchive = probeUnarchive(surfaces, archive);
    const shutdown = probeShutdown(surfaces);
    const remove = probeDelete(surfaces, shutdown, unarchive);
    return {
      archive,
      unarchive,
      shutdown,
      delete: remove,
      deleteLegacy: probeDeleteLegacy(surfaces, remove),
      metadata: probeMetadata(surfaces)
    };
  } catch (error) {
    return allBlocked("probe-failed", errorMessage(error));
  }
}
function describeCapabilities(report) {
  return Object.keys(report).map((id) => {
    const status = report[id];
    return status.available ? `  ${id}: available` : `  ${id}: disabled (${status.code}; ${status.subject})`;
  });
}

// src/host/log-remover.ts
import { rm } from "node:fs/promises";
var LogRemover = class {
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * Delete a batch of archived sessions.
   *
   * Sequential, and each session is independent: one refusal never cancels the
   * rest, and each outcome carries its own reason so the panel can show exactly
   * which ones survived and why.
   *
   * @param ids - sessions to delete.
   * @returns one outcome per id, in input order.
   */
  async remove(ids) {
    const archived = new Set(this.deps.archive.archived());
    const outcomes = [];
    for (const id of ids) outcomes.push(await this.removeOne(id, archived));
    return outcomes;
  }
  async removeOne(id, archived) {
    const invalid = validateSessionId(id);
    if (invalid !== void 0) return failure(id, "invalid-session-id", invalid);
    if (!archived.has(id)) {
      return failure(id, "not-archived", "only an archived session can be deleted");
    }
    try {
      await this.deps.teardown.teardown(id);
    } catch (error) {
      return failure(id, "teardown-effect-missing", describeError(error));
    }
    const located = await this.locate(id);
    if (located.kind === "refused") return failure(id, located.code, located.detail);
    if (located.kind !== "nothing") {
      const lease = await probeWriteLeaseReleased(this.deps.persistence, id);
      if (!lease.released) return failure(id, "write-lease-held", lease.detail);
      const refusal = await this.vouchFor(id, located);
      if (refusal !== void 0) return refusal;
      try {
        await rm(located.dir, { recursive: true, force: true });
      } catch (error) {
        return failure(id, "remove-failed", describeError(error));
      }
      this.deps.logger.info(
        located.kind === "derived" ? `session-archive: removed log directory ${located.dir} of session "${id}"; the path was derived by this plugin under ${located.root}, not supplied by the backend` : `session-archive: removed log directory ${located.dir} of session "${id}"`
      );
    }
    return await this.forgetSession(id) ?? success(id);
  }
  /**
   * Vouch for the directory about to be removed.
   *
   * A backend-supplied path is checked for containment and shape only —
   * asserting a basename this plugin cannot reproduce would be second-guessing
   * the backend's own segment encoder, and a wrong guess there refuses every
   * legitimate delete. A derived path has no such authority behind it, so all
   * four ownership proofs must hold and the failing one is what gets reported.
   */
  async vouchFor(id, located) {
    if (located.kind === "derived") {
      const proof = await proveDerivedOwnership({ dir: located.dir, sessionId: id, root: located.root });
      if (proof === void 0) return void 0;
      this.deps.logger.warn(
        `session-archive: refusing to remove derived path ${located.dir} for session "${id}": ${proof}`
      );
      return failure(id, proof, `${proof}: ${located.dir}`);
    }
    const root = this.deps.sessionRoot;
    const rejection = checkSessionDirectory({ dir: located.dir, ...root.known ? { root: root.path } : {} });
    return rejection === void 0 ? void 0 : failure(id, "log-path-refused", `${rejection}: ${located.dir}`);
  }
  /** Resolve the directory to remove, or the refusal that stands in its way. */
  async locate(id) {
    let location;
    try {
      location = await locateSessionLog(this.deps.persistence, id, this.deps.sessionRoot);
    } catch (error) {
      return { kind: "refused", code: "host-error", detail: describeError(error) };
    }
    switch (location.kind) {
      case "current":
        return { kind: "backend", dir: location.dir };
      case "unreadable-format":
        this.deps.logger.warn(`session-archive: session "${id}" stores an unreadable generation: ${location.detail}`);
        return { kind: "backend", dir: location.dir };
      case "derived":
        return { kind: "derived", dir: location.dir, root: location.root };
      case "absent":
        return { kind: "nothing" };
      case "root-unknown":
        return { kind: "refused", code: "log-root-unknown", detail: location.reason };
      case "ambiguous":
        return {
          kind: "refused",
          code: "log-path-refused",
          detail: `more than one directory claims this session: ${location.dirs.join(", ")}`
        };
      case "not-found":
      default:
        return {
          kind: "refused",
          code: "legacy-log-not-found",
          detail: `the backend will not name this session's log and no directory under ${location.root} is named after it`
        };
    }
  }
  /**
   * Drop the id from every workspace ledger and then from the archive set.
   *
   * Both are required for the row to actually disappear, and the order is the
   * delete sequence's own: an id left in a ledger comes back as a visible
   * session pointing at nothing, so it must go first, and the archive set is
   * released last because leaving the set is what makes the session eligible
   * to reappear.
   *
   * A failure here is reported, never logged and swallowed. The log is already
   * gone at this point, so the honest thing to tell a user is which half of the
   * bookkeeping survived — and the archive-set write is deliberately skipped
   * when a ledger still holds the id, because releasing it then would resurface
   * the session as a live, ungrouped row over a directory that no longer
   * exists.
   *
   * @returns the failure to report, or undefined when the session is fully forgotten.
   */
  async forgetSession(id) {
    const stuck = [];
    for (const workspace of this.deps.registry.list()) {
      if (!workspace.sessionIds.includes(id)) continue;
      try {
        await workspace.detachSession(id);
      } catch (error) {
        stuck.push(`${workspace.id}: ${describeError(error)}`);
      }
    }
    if (stuck.length > 0) {
      const detail = `the log is deleted, but the session is still in ${String(stuck.length)} workspace ledger(s) and was left in the archive set \u2014 ${stuck.join("; ")}`;
      this.deps.logger.warn(`session-archive: could not detach deleted session "${id}": ${detail}`);
      return failure(id, "ledger-detach-failed", detail);
    }
    try {
      await this.deps.archive.dropFromArchiveSet([id]);
    } catch (error) {
      const detail = `the log is deleted and the workspace ledgers are clean, but the id is still in the archive set: ${describeError(error)}`;
      this.deps.logger.warn(`session-archive: archive set not updated for deleted session "${id}": ${detail}`);
      return failure(id, "archive-set-stale", detail);
    }
    return void 0;
  }
};

// src/host/metadata-reader.ts
var LIST_METADATA_KEY = "sessionListMetadata";
var TITLE_KEY = "title";
var NO_INHERITED_PREFIX = 0;
var MetadataReader = class {
  constructor(deps) {
    this.deps = deps;
  }
  /**
   * Read the full session catalog.
   *
   * `persistence.list()` is the corpus: it reports every materialized session
   * plus this process's created-but-unmaterialized ones, which is exactly the
   * set the built-in sidebar can show.
   *
   * The corpus read is the one host call on this path with no smaller unit to
   * fail at: the backend either enumerates every session or throws, and a
   * single unreadable log on disk is enough to make it throw. Letting that out
   * would take the whole archive area down over one bad file, so it is turned
   * into a state the callers above can describe rather than an exception they
   * can only propagate.
   *
   * @returns one row per session, or the reason there are none to give.
   */
  async catalog() {
    let snapshots;
    try {
      snapshots = await this.deps.persistence.list();
    } catch (error) {
      this.deps.logger.warn(
        `session-archive: the session corpus could not be enumerated, so the archive area has nothing to describe: ${describeError(error)}`
      );
      return { kind: "unreadable", reason: describeError(error) };
    }
    const cache = this.deps.projectionCache;
    return {
      kind: "read",
      degraded: cache === void 0,
      rows: snapshots.map((snapshot) => this.rowOf(snapshot.header, snapshot.sizeBytes, cache))
    };
  }
  rowOf(header, sizeBytes, cache) {
    const values = this.projectionsOf(header, cache);
    const metadata = values[LIST_METADATA_KEY];
    const title = values[TITLE_KEY];
    return {
      id: header.id,
      createdAt: header.createdAt,
      cwd: header.cwd,
      origin: header.origin,
      sizeBytes,
      blank: readBoolean(metadata, "blank") ?? false,
      lastPromptAt: readNumber(metadata, "lastPromptAt"),
      title: typeof title === "string" && title.length > 0 ? title : void 0
    };
  }
  /**
   * The cold-session projection ladder, as the built-in session list runs it.
   *
   * A forked session is skipped outright rather than queried with a guessed
   * inherited cut: the exact cut is part of the checkpoint's identity and is
   * only obtainable by opening the log, so a guess could only ever miss or —
   * worse — match a different lifecycle. The built-in list makes the same
   * choice, so this loses nothing the official UI shows.
   *
   * Failure degrades to no projections at all. The archive area showing session
   * ids is a far better outcome than the panel refusing to open.
   */
  projectionsOf(header, cache) {
    if (cache === void 0 || header.isSeeded) return {};
    try {
      const block = cache.cachedSnapshot(header, NO_INHERITED_PREFIX, [LIST_METADATA_KEY, TITLE_KEY]) ?? cache.cachedPredecessorTitle(header, NO_INHERITED_PREFIX);
      return block?.values ?? {};
    } catch (error) {
      this.deps.logger.warn(
        `session-archive: projection read for session "${header.id}" failed; serving the row without it: ${describeError(error)}`
      );
      return {};
    }
  }
};
function updatedAtOf(row) {
  return Math.max(row.createdAt, row.lastPromptAt ?? 0);
}
function readBoolean(source, key) {
  if (typeof source !== "object" || source === null) return void 0;
  const value = source[key];
  return typeof value === "boolean" ? value : void 0;
}
function readNumber(source, key) {
  if (typeof source !== "object" || source === null) return void 0;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

// src/domain/grouping.ts
var NO_SELECTION = void 0;
function hiddenReason(entry, current, archived) {
  if (entry.origin === "subagent") return "subagent";
  if (archived.has(entry.id)) return "already-archived";
  if (entry.blank && entry.id !== current) return "blank";
  return void 0;
}
function sessionVisible(entry, current, archived) {
  return hiddenReason(entry, current, archived) === void 0;
}
function groupSessions(input) {
  const byId = new Map(input.sessions.map((entry) => [entry.id, entry]));
  const accountedIds = /* @__PURE__ */ new Set();
  const workspaces = [];
  for (const workspace of input.workspaces) {
    const accounted = [];
    const visible = [];
    for (const id of workspace.sessionIds) {
      const entry = byId.get(id);
      if (entry === void 0) continue;
      accountedIds.add(id);
      accounted.push(id);
      if (sessionVisible(entry, input.current, input.archived)) visible.push(id);
    }
    workspaces.push({ workspaceId: workspace.workspaceId, accounted, visible });
  }
  const strays = input.sessions.filter((entry) => !accountedIds.has(entry.id));
  return {
    workspaces,
    ungrouped: {
      accounted: strays.map((entry) => entry.id),
      visible: strays.filter((entry) => sessionVisible(entry, input.current, input.archived)).map((entry) => entry.id)
    }
  };
}
function planBulkArchive(input) {
  const byId = new Map(input.sessions.map((entry) => [entry.id, entry]));
  const grouping = groupSessions(input);
  let members;
  if (input.scope.kind === "ungrouped") {
    members = grouping.ungrouped.accounted;
  } else {
    const workspaceId = input.scope.workspaceId;
    members = grouping.workspaces.find((group) => group.workspaceId === workspaceId)?.accounted;
  }
  if (members === void 0) return { targets: [], skipped: [], unknownScope: true };
  const targets = [];
  const skipped = [];
  for (const id of members) {
    const entry = byId.get(id);
    if (entry === void 0) continue;
    const reason = hiddenReason(entry, NO_SELECTION, input.archived);
    if (reason === void 0) targets.push(id);
    else skipped.push({ id, reason });
  }
  return { targets, skipped, unknownScope: false };
}

// src/host/service.ts
function capabilityDetail(capability, report) {
  const status = report[capability];
  return `${capability} is disabled: ${status.code ?? "unknown"} (${status.subject ?? "unknown"})`;
}
function refuseBatch(ids, capability, report) {
  const detail = capabilityDetail(capability, report);
  return { outcomes: ids.map((id) => failure(id, "capability-disabled", detail)) };
}
function refuseBulk(code, detail) {
  return { archived: [], skipped: [], failed: [], refusal: { code, detail } };
}
var SessionArchiveService = class {
  constructor(deps) {
    this.deps = deps;
  }
  /** The startup probe's verdict, plus enough context to diagnose a blocked one. */
  capabilities() {
    return {
      capabilities: this.deps.capabilities,
      persistenceBackend: this.deps.persistenceBackend,
      version: this.deps.version
    };
  }
  /**
   * The archive area's contents.
   *
   * Ordered newest activity first, matching the built-in session list, so a
   * user moving between the sidebar and the archive area sees one ordering.
   *
   * @returns the rows, their total size, and the ids that resolve to nothing.
   */
  async list() {
    const archived = new Set(this.deps.archive.archived());
    const catalog = await this.deps.metadata.catalog();
    if (catalog.kind === "unreadable") {
      return { entries: [], totalSizeBytes: 0, unresolved: [], degraded: false, catalogError: catalog.reason };
    }
    const workspaceOf = this.workspaceIndex();
    const rows = catalog.rows.filter((row) => archived.has(row.id));
    const found = new Set(rows.map((row) => row.id));
    const entries = rows.sort((left, right) => updatedAtOf(right) - updatedAtOf(left)).map((row) => this.entryOf(row, workspaceOf));
    return {
      entries,
      totalSizeBytes: entries.reduce((total, entry) => total + (entry.sizeBytes ?? 0), 0),
      // An archived id the persistence backend no longer lists: the log was
      // removed outside this plugin, so the archive set has a dangling member.
      unresolved: [...archived].filter((id) => !found.has(id)),
      degraded: catalog.degraded,
      catalogError: void 0
    };
  }
  /** Take sessions out of the archive set, making them visible again. */
  async unarchive(ids) {
    if (!this.deps.capabilities.unarchive.available) {
      return refuseBatch(ids, "unarchive", this.deps.capabilities);
    }
    return { outcomes: await this.deps.archive.unarchive(ids) };
  }
  /** Delete archived sessions' logs. */
  async delete(ids) {
    if (!this.deps.capabilities.delete.available) {
      return refuseBatch(ids, "delete", this.deps.capabilities);
    }
    return { outcomes: await this.deps.remover.remove(ids) };
  }
  /** Archive every session displayed under one workspace row. */
  async archiveWorkspace(workspaceId) {
    return this.bulkArchive({ kind: "workspace", workspaceId });
  }
  /** Archive every session displayed under the ungrouped row. */
  async archiveUngrouped() {
    return this.bulkArchive({ kind: "ungrouped" });
  }
  /**
   * The sessions a shutdown could act on, named well enough to confirm.
   *
   * Split from {@link shutdown} on purpose. "Close everything" is a policy, not
   * a primitive: a caller reads the list, decides what belongs in its own
   * notion of "everything" — the archive panel leaves out the session the user
   * is looking at — and passes exactly those ids back. A number alone could
   * never be checked against anything.
   *
   * @returns one row per live root agent, newest activity first.
   */
  async running() {
    const ids = this.deps.teardown.runningSessionIds();
    if (ids.length === 0) return { sessions: [], catalogError: void 0 };
    const catalog = await this.deps.metadata.catalog();
    if (catalog.kind === "unreadable") {
      return {
        sessions: ids.map((id) => ({ id, title: void 0, cwd: void 0, blank: false })),
        catalogError: catalog.reason
      };
    }
    const live = new Set(ids);
    const described = new Map(catalog.rows.filter((row) => live.has(row.id)).map((row) => [row.id, row]));
    const sessions = ids.map((id) => described.get(id)).filter((row) => row !== void 0).sort((left, right) => updatedAtOf(right) - updatedAtOf(left)).map((row) => ({ id: row.id, title: row.title, cwd: row.cwd, blank: row.blank }));
    const undescribed = ids.filter((id) => !described.has(id)).map((id) => ({ id, title: void 0, cwd: void 0, blank: true }));
    return { sessions: [...sessions, ...undescribed], catalogError: void 0 };
  }
  /**
   * Stop the named sessions, releasing the resources their agents hold.
   *
   * The only shutdown primitive. Closing one session and closing every
   * background session are the same call with a different list, so neither can
   * drift away from the other's semantics.
   */
  async shutdown(ids) {
    if (!this.deps.capabilities.shutdown.available) {
      return refuseBatch(ids, "shutdown", this.deps.capabilities);
    }
    return { outcomes: await this.deps.teardown.teardownEach(ids) };
  }
  async bulkArchive(scope) {
    if (!this.deps.capabilities.archive.available) {
      return refuseBulk("capability-disabled", capabilityDetail("archive", this.deps.capabilities));
    }
    const catalog = await this.deps.metadata.catalog();
    if (catalog.kind === "unreadable") {
      return refuseBulk("catalog-unreadable", catalog.reason);
    }
    const plan = planBulkArchive({ ...this.groupingInput(catalog), scope });
    if (plan.unknownScope) {
      return refuseBulk(
        "unknown-scope",
        scope.kind === "workspace" ? `workspace "${scope.workspaceId}" has no ledger` : "no ungrouped row"
      );
    }
    const outcomes = await this.deps.archive.archive(plan.targets);
    return {
      archived: outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id),
      skipped: plan.skipped,
      failed: outcomes.filter((outcome) => !outcome.ok)
    };
  }
  /** Shape an already-read catalog into what the grouping rules consume. */
  groupingInput(catalog) {
    return {
      sessions: catalog.rows.map(sessionEntryOf),
      workspaces: this.deps.registry.list().map((workspace) => ({
        workspaceId: workspace.id,
        sessionIds: workspace.sessionIds
      })),
      archived: new Set(this.deps.archive.archived()),
      // Not an omission: the selected session is browser state that no host
      // surface publishes, and bulk archive withholds it on purpose anyway.
      current: NO_SELECTION
    };
  }
  /** Which workspace's ledger still holds each session. */
  workspaceIndex() {
    const index = /* @__PURE__ */ new Map();
    for (const workspace of this.deps.registry.list()) {
      for (const sessionId of workspace.sessionIds) {
        index.set(sessionId, { id: workspace.id, title: workspace.title });
      }
    }
    return index;
  }
  entryOf(row, workspaceOf) {
    const workspace = workspaceOf.get(row.id);
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      lastActivityAt: row.lastPromptAt,
      sizeBytes: row.sizeBytes,
      cwd: row.cwd,
      workspaceId: workspace?.id,
      workspaceTitle: workspace?.title
    };
  }
};
function sessionEntryOf(row) {
  return { id: row.id, origin: row.origin, blank: row.blank };
}

// src/contract.ts
var CHANNEL = "/api";
var ENDPOINT_NAMESPACE = "session-archive";
function endpointName(operation) {
  return `${ENDPOINT_NAMESPACE}.${operation}`;
}
function endpointPath(operation) {
  return `${CHANNEL}/${endpointName(operation)}`;
}
var TRANSPORT_FAILURE = {
  badRequest: "session-archive/bad-request",
  handlerFailed: "session-archive/handler-failed",
  noConnection: "session-archive/no-connection",
  transport: "session-archive/transport"
};
var OPERATIONS = [
  "capabilities",
  "list",
  "unarchive",
  "delete",
  "archiveWorkspace",
  "archiveUngrouped",
  "running",
  "shutdown"
];

// src/host/transport/endpoint-router.ts
var UNKNOWN_RPC_ID = "00000000-0000-0000-0000-000000000000";
function decodeRequest(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "body is not a JSON object";
  const record2 = body;
  if (record2["type"] !== "client-request") return 'envelope type must be "client-request"';
  if (typeof record2["rpcId"] !== "string") return "envelope rpcId must be a string";
  if (typeof record2["method"] !== "string") return "envelope method must be a string";
  return { rpcId: record2["rpcId"], method: record2["method"], payload: record2["payload"] };
}
function successEnvelope(rpcId, value) {
  return Response.json({ type: "server-response", rpcId, result: { ok: true, value } });
}
function failureEnvelope(rpcId, code, message) {
  return Response.json({ type: "server-response", rpcId, result: { ok: false, error: { code, message, details: {} } } });
}
function registerEndpoints(ctx, handlers) {
  for (const operation of OPERATIONS) {
    const method = endpointName(operation);
    const handler = handlers[operation];
    const route = {
      path: endpointPath(operation),
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return failureEnvelope(UNKNOWN_RPC_ID, TRANSPORT_FAILURE.badRequest, "request body is not valid JSON");
        }
        const envelope = decodeRequest(body);
        if (typeof envelope === "string") {
          return failureEnvelope(UNKNOWN_RPC_ID, TRANSPORT_FAILURE.badRequest, envelope);
        }
        if (envelope.method !== method) {
          return failureEnvelope(
            envelope.rpcId,
            TRANSPORT_FAILURE.badRequest,
            `method ${envelope.method} does not match ${method}`
          );
        }
        try {
          return successEnvelope(envelope.rpcId, await handler(envelope.payload));
        } catch (error) {
          ctx.logger.warn(`session-archive: endpoint ${method} failed: ${describeError(error)}`);
          return failureEnvelope(envelope.rpcId, TRANSPORT_FAILURE.handlerFailed, describeError(error));
        }
      }
    };
    try {
      ctx.effect(() => ctx.connection.fetch.register(route), `session-archive: ${CHANNEL} route ${method}`);
    } catch (error) {
      ctx.logger.error(`session-archive: could not mount ${route.path}: ${describeError(error)}`);
    }
  }
}

// src/host/payload.ts
var PayloadError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PayloadError";
  }
};
function record(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new PayloadError("payload must be a JSON object");
  }
  return payload;
}
function readStringArray(payload, key) {
  const value = record(payload)[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new PayloadError(`payload.${key} must be an array of strings`);
  }
  return value;
}
function readString(payload, key) {
  const value = record(payload)[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new PayloadError(`payload.${key} must be a non-empty string`);
  }
  return value;
}

// src/index.ts
var name = "session-archive";
var VERSION = true ? "0.1.0" : "0.0.0-source";
var inject = ["connection", "workspaceRegistry", "sessionPersistence"];
function apply(ctx, config) {
  try {
    mount(ctx, config);
  } catch (error) {
    ctx.logger.error(`session-archive: failed to mount; the plugin is inert: ${describeError(error)}`);
  }
}
function mount(ctx, config) {
  const registry = ctx.workspaceRegistry;
  const persistence = ctx.sessionPersistence;
  const storageDomain = ctx.get("storageDomain");
  const projectionCache = ctx.get("sessionProjectionCache");
  const agents = ctx.get("agents");
  const sessionRoot = resolveSessionRoot(persistence, config.sessionRoot);
  const capabilities = probeCapabilities({
    registry: ctx.registry,
    agents,
    workspaceRegistry: registry,
    persistence,
    storageDomain,
    projectionCache,
    sessionRoot
  });
  ctx.logger.info(
    [
      "session-archive: capability probe",
      `  session log root: ${describeSessionRoot(sessionRoot)}`,
      ...describeCapabilities(capabilities)
    ].join("\n")
  );
  const archive = new ArchiveWriter({ registry, storageDomain });
  const teardown = new AgentTeardown({ registry: ctx.registry, agents, logger: ctx.logger });
  const metadata = new MetadataReader({ persistence, projectionCache, logger: ctx.logger });
  const remover = new LogRemover({
    persistence,
    registry,
    teardown,
    archive,
    sessionRoot,
    logger: ctx.logger
  });
  const service = new SessionArchiveService({
    capabilities,
    persistenceBackend: backendName(persistence),
    version: VERSION,
    registry,
    metadata,
    archive,
    teardown,
    remover
  });
  registerEndpoints(ctx, {
    capabilities: async () => service.capabilities(),
    list: async () => service.list(),
    unarchive: async (payload) => service.unarchive(readStringArray(payload, "ids")),
    delete: async (payload) => service.delete(readStringArray(payload, "ids")),
    archiveWorkspace: async (payload) => service.archiveWorkspace(readString(payload, "workspaceId")),
    archiveUngrouped: async () => service.archiveUngrouped(),
    running: async () => service.running(),
    shutdown: async (payload) => service.shutdown(readStringArray(payload, "ids"))
  });
}
export {
  Config,
  apply,
  inject,
  name
};
