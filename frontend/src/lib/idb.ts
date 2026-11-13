/** Armazenamento simples em IndexedDB (para bases grandes que o usuário carrega uma vez). */
const DB = 'marx-store'
const STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => res(r.result as T)
      r.onerror = () => rej(r.error)
    })
  } catch {
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* sem persistência (modo privado etc.): segue sem cache */
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => res()
      tx.onerror = () => res()
    })
  } catch {
    /* ignora */
  }
}
