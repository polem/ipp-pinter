'use strict'

import { EventEmitter } from 'events'
import { name as packageName } from '../package.json'
import debugFactory from 'debug'
import ipp, { CONSTANTS as C, IppRequest } from 'ipp-encoder'

import utils from './utils'
import bind from './bind'
import Job from './job'
import { IncomingMessage } from 'http'
import groups from './groups'
var util = require('util')

const debug = debugFactory(packageName);

class Printer extends EventEmitter {
  jobId: number = 0
  private _zeroconf: boolean = false
  started: number = Date.now()
  jobs: Job[] = []
  name: any
  port?: number
  uri?: string
  state: C = C.PRINTER_STOPPED
  fallback: any

  constructor(opts: { name?: string, uri?: string, port?: number, fallback?: boolean, zeroconf?: boolean } | string) {
    super()

    const defaultOptions = {
      name: 'Node JS',
      fallback: true,
      zeroconf: true,
    }

    const resolvedOptions = {
      ...defaultOptions,
      ...(typeof opts === 'string' ? { name: opts } : opts)
    }

    this._zeroconf = resolvedOptions.zeroconf
    this.name = resolvedOptions.name
    this.port = resolvedOptions.port
    this.uri = resolvedOptions.uri
    this.fallback = resolvedOptions.fallback

    bind(this)
  }

  start() {
    this.state = C.PRINTER_IDLE
    debug('printer "%s" changed state to idle', this.name)
  }

  stop() {
    this.state = C.PRINTER_STOPPED
    debug('printer "%s" changed state to stopped', this.name)
  }

  add(job: Job) {
    this.jobs.push(job)
    this.emit('job', job)
  }

  attributes(filter?: string | null) {
    if (filter && ~filter.indexOf('all')) filter = null
    if (filter) filter = utils.expandAttrGroups(filter)

    const now = new Date()
    const attrs = [
      { tag: C.URI, name: 'printer-uri-supported', value: this.uri },
      { tag: C.KEYWORD, name: 'uri-security-supported', value: 'none' }, // none, ssl3, tls
      { tag: C.KEYWORD, name: 'uri-authentication-supported', value: 'none' }, // none, requesting-user-name, basic, digest, certificate
      { tag: C.NAME_WITH_LANG, name: 'printer-name', value: { lang: 'en-us', value: this.name } },
      { tag: C.ENUM, name: 'printer-state', value: this.state },
      { tag: C.KEYWORD, name: 'printer-state-reasons', value: 'none' },
      { tag: C.KEYWORD, name: 'ipp-versions-supported', value: '1.1' }, // 1.0, 1.1
      { tag: C.ENUM, name: 'operations-supported', value: [C.PRINT_JOB, C.VALIDATE_JOB, C.GET_JOBS, C.GET_PRINTER_ATTRIBUTES, C.CANCEL_JOB, C.GET_JOB_ATTRIBUTES] },
      { tag: C.CHARSET, name: 'charset-configured', value: 'utf-8' },
      { tag: C.CHARSET, name: 'charset-supported', value: 'utf-8' },
      { tag: C.NATURAL_LANG, name: 'natural-language-configured', value: 'en-us' },
      { tag: C.NATURAL_LANG, name: 'generated-natural-language-supported', value: 'en-us' },
      { tag: C.MIME_MEDIA_TYPE, name: 'document-format-default', value: 'application/postscript' },
      { tag: C.MIME_MEDIA_TYPE, name: 'document-format-supported', value: ['text/html', 'text/plain', 'application/vnd.hp-PCL', 'application/octet-stream', 'application/pdf', 'application/postscript'] },
      { tag: C.BOOLEAN, name: 'printer-is-accepting-jobs', value: true },
      { tag: C.INTEGER, name: 'queued-job-count', value: this.jobs.length },
      { tag: C.KEYWORD, name: 'pdl-override-supported', value: 'not-attempted' }, // attempted, not-attempted
      { tag: C.INTEGER, name: 'printer-up-time', value: utils.time(this, now) },
      { tag: C.DATE_TIME, name: 'printer-current-time', value: now },
      { tag: C.KEYWORD, name: 'compression-supported', value: ['deflate', 'gzip'] } // none, deflate, gzip, compress
    ]

    if (!filter) { return attrs }

    return attrs.filter(function (attr) {
      return filter && ~filter.indexOf(attr.name)
    })
  }

  getJob(id: number) {
    for (let i = 0, l = this.jobs.length; i < l; i++) {
      if (this.jobs[i].id === id) return this.jobs[i]
    }
  }
}

export default Printer;

class PrinterRequest {
  constructor(
    public body: IppRequest
  ) {
  }

  static async createFromHttpRequest(request: IncomingMessage) {
    const body : IppRequest = await new Promise((resolve, reject) => {
      let buffer : Buffer;

      const fail = () => {
        // decode only the most essential part of the IPP request header to allow
        // best possible response
        if (buffer.length >= 8) {
          resolve({
            version: { major: buffer.readInt8(0), minor: buffer.readInt8(1) },
            operationId: buffer.readInt16BE(2),
            requestId: buffer.readInt32BE(4),
          })
        }
        reject(buffer)
      }

      const consumeAttrGroups = (chunk: Uint8Array) => {
        buffer = Buffer.concat([buffer, chunk])

        try {
          const body = ipp.request.decode(buffer)

          request.removeListener('data', consumeAttrGroups)
          request.removeListener('end', fail)

          resolve(body);
        } catch (e) {
          debug('incomplete IPP body - waiting for more data...')
          return
        }
      }

      request.on('data', consumeAttrGroups)
      request.on('end', fail)
    })

    return new PrinterRequest(body)
  }
}

class PrinterResponse {
  send(printer: Printer, req: PrinterRequest, statusCode, _groups = []): IppRequest {
    if (typeof statusCode === 'object') return this.send(printer, req, res, C.SUCCESSFUL_OK, statusCode)
    if (statusCode === undefined) statusCode = C.SUCCESSFUL_OK

    if (printer.fallback && req && req.body.version.major === 1 && req.body.version.minor === 0) obj.version = { major: 1, minor: 0 }


    const body = {
      statusCode,
      requestId: req ? req.body.requestId : 0,
      groups: [groups.operationAttributesTag(ipp.STATUS_CODES[statusCode])].concat(_groups)
    };

    debug('responding to request #%d', body.requestId, util.inspect(body, { depth: null }))

    return body
  }
}

export {
  PrinterResponse,
  PrinterRequest
}