import Bigint from '../tools/bigint'
import Bluebird from 'bluebird'
import {request} from '../tools/smb2-forge'
import {Writable} from 'stream'

import {
  FILE_OPEN,
  FILE_OPEN_IF,
  FILE_OVERWRITE_IF,
  FILE_CREATE
} from '../structures/constants'

const requestAsync = Bluebird.promisify(request)

const maxPacketSize = new Bigint(8, 0x00010000 - 0x71)

function * fibonacci () {
  let a = 1
  let b = 2

  for (;;) {
    const c = a
    a = b
    b = c + a
    yield c
  }
}

function writeChunk(buffer, size, start, offset, file, connection, retryGen) {
  if (offset.ge(size)) {
    return Promise.resolve();
  }

  const remainingSize = size.sub(offset);
  const packetSize = maxPacketSize.lt(remainingSize) ? maxPacketSize : remainingSize;
  const nextOffset = offset.add(packetSize);

  return requestAsync('write', {
      FileId: file.FileId,
      Offset: start.add(offset).toBuffer(),
      Buffer: buffer.slice(offset.toNumber(), nextOffset.toNumber())
    }, connection)
    .catch((err) => {
      return err.code === 'STATUS_PENDING'
        ? Promise
          .delay(retryGen.next().value)
          .then(writeChunk.bind(undefined, buffer, size, start, offset, file, connection, retryGen))
        : Promise.reject(err);
    })
    .then(writeChunk.bind(undefined, buffer, size, start, nextOffset, file, connection, retryGen));
}

class SmbWritableStream extends Writable {
  constructor (connection, file, options = {}) {
    // Respect the encoding option
    if (options.encoding) {
      options.defaultEncoding = options.encoding;
    }
    // Always decode strings to buffers
    options.decodeStrings = true;

    super(options)

    this.connection = connection
    this.file = file
    this.offset = new Bigint(8, options.start || 0)
    this.once('finish', () => requestAsync('close', this.file, this.connection));
  }

  _write (chunk, enc, cb) {
    writeChunk(
        chunk,
        new Bigint(8, chunk.length),
        new Bigint(this.offset),
        new Bigint(8, 0),
        this.file,
        this.connection,
        fibonacci()
      )
      .then(() => { this.offset = this.offset.add(chunk.length); })
      .then(cb, cb);
  }
}

export default function (path, options, cb) {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }

  let createDisposition
  const flags = options && options.flags

  if (flags === 'r') {
    createDisposition = FILE_OPEN
  } else if (flags === 'r+') {
    createDisposition = FILE_OPEN_IF
  } else if (flags === 'w' || flags === 'w+') {
    createDisposition = FILE_OVERWRITE_IF
  } else if (flags === 'wx' || flags === 'w+x') {
    createDisposition = FILE_CREATE
  }

  request('create', { path, createDisposition }, this, (err, file) => {
    if (err) {
      cb(err)
    } else {
      cb(null, new SmbWritableStream(this, file, options))
    }
  })
}
