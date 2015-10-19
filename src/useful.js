import {fromJS, Iterable} from 'immutable'

export function jsify(obj) {
  if (obj == null) {
    return null
  } else if (typeof obj === 'object') {
    return fromJS(obj).toJS()
  } else {
    return obj
  }
}

export function isEmpty(obj) {
  return Object.keys(obj).length === 0
}

export function forEachKV(obj, fn) {
  Object.keys(obj).forEach((key) => fn(key, obj[key]))
}

export function toArr(obj) {
  let result = []
  forEachKV(obj, (key, val) => result.push([key, val]))
  return result
}

export function sum(arr) {
  return arr.reduce((x, y) => x + y, 0)
}

export function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n)
}

export function all(iterable, fn) {
  for (let elem of iterable) {
    if (!fn(elem)) {
      return false
    }
  }
  return true
}

export function any(iterable, fn) {
  for (let elem of iterable) {
    if (fn(elem)) {
      return true
    }
  }
  return false
}

export function stringContains(where, what) {
  return where.indexOf(what) > -1
}

export function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false
  }
  return obj[Symbol.iterator] !== undefined
}

export function extend(array, elems) {
  return Array.prototype.push.apply(array, Array.from(elems))
}

export function flattenShallow(iterable) {
  return flatmap(iterable, (_) => _)
}

export function flatmap(iterable, fn) {
  let res = []
  for (let elem of iterable) {
    let toAppend = fn(elem)
    if (isIterable(toAppend)) {
      extend(res, toAppend)
    } else {
      throw new Error(`flatmap values must be iterables, got ${toAppend}`)
    }
  }
  return res
}

export function repeat(num, fn) {
  for (let i = 0; i < num; i++) {
    fn(i)
  }
}

export function randRange(from = 0, to) {
  let args = arguments
  if (args.length === 1) {
    return Math.floor(Math.random() * args[0])
  } else if (args.length === 2) {
    if (args[1] < args[0]) {
      throw new Error(`'from' must be less than 'to'`)
    }
    return args[0] + Math.floor(Math.random() * (args[1] - args[0]))
  } else throw new Error(`randRange accepts only 1 or 2 arguments, got ${arguments.length}`)
}

export function randomChoiceWeighted(possibilities) {
  if (isImmutable(possibilities)) {
    possibilities = possibilities.toJS()
  }
  let r = Math.random()
  // last element excluded intentionally
  for (let i = 0; i < possibilities.length - 1; i++) {
    let [possibility, weight] = possibilities[i]
    r -= weight
    if (r <= 0) {
      return possibility
    }
  }
  return possibilities[possibilities.length - 1]
}

export function randomChoice(list) {
  if (Iterable.isIterable(list)) return list.get(Math.floor(Math.random() * list.count()))
  else return list[Math.floor(Math.random() * list.length)]
}

export function getRandomValue() {
  return Math.random().toString(36).substring(7)
}

export function repeatAsync(n, f) {
  let res = Promise.resolve()
  repeat(n, (i) => {
    res = res.then((_) => f(i))
  })
  return res
}

export function isImmutable(o) {
  // this is the best solution I found:
  // http://stackoverflow.com/questions/31907470/how-to-check-if-object-is-immutable
  return Iterable.isIterable(o)
}

export function isArray(arr) {
  return (typeof arr === 'object') && (arr.constructor === Array)
}
