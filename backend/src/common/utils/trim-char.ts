// Loops rather than /^x+|x+$/: the trailing-run regex backtracks from every position, which is
// quadratic on input like a long run of slashes followed by one other character.

/** Strip every leading and trailing occurrence of `char`. */
export function trimChar(value: string, char: string): string {
  return trimCharStart(trimCharEnd(value, char), char)
}

/** Strip every leading occurrence of `char`. */
export function trimCharStart(value: string, char: string): string {
  let start = 0
  while (start < value.length && value[start] === char) start++
  return value.slice(start)
}

/** Strip every trailing occurrence of `char`. */
export function trimCharEnd(value: string, char: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === char) end--
  return value.slice(0, end)
}
