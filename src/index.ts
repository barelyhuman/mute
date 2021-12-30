type ValSetterT<T> = [T, (x: T) => void]

export function $mut<T>(x: ValSetterT<T>): ValSetterT<T> {
  return x
}
