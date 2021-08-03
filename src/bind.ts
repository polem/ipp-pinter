'use strict'

var util = require('util')
import { IncomingMessage, ServerResponse } from 'http'
import Printer from './printer'
var debug = require('debug')(require('../package').name)
import operations from './operations'

import ipp, { CONSTANTS as C, IppRequest } from 'ipp-encoder'
import { DecodedIppBody } from './types'
import { resolve } from 'path/posix'
import { Socket } from 'net'


class PrintServer {
  protected printer: Printer

  constructor(printer: Printer) {
    this.printer = printer;
  }

  onRequest (req: IncomingMessage, res: ServerResponse) {
    debug('HTTP request: %s %s', req.method, req.url)

    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    } else if (req.headers['content-type'] !== 'application/ipp') {
      res.writeHead(400)
      res.end()
      return
    }

    const decodedBody = await new Promise(() => {
      const chunks: [] = []

      const fail = () => {
        // decode only the most essential part of the IPP request header to allow
        // best possible response
        if (req.body.length >= 8) {
          const body = {
            version: { major: req.body.readInt8(0), minor: req.body.readInt8(1) },
            operationId: req.body.readInt16BE(2),
            requestId: req.body.readInt32BE(4)
          }
        }
        reject({
          body, res, C.CLIENT_ERROR_BAD_REQUEST
        })
      }

      const consumeAttrGroups = (chunk) => {
        chunks.push(chunk)

        try {
          const decodedBody = ipp.request.decode(Buffer.from(chunks))

          req.removeListener('data', consumeAttrGroups)
          req.removeListener('end', fail)

          resolve(decodedBody);
        } catch (e) {
          debug('incomplete IPP body - waiting for more data...')
          return
        }
      }

      req.on('data', consumeAttrGroups)
      req.on('end', fail)
    })

    this.printer.emit('operation', decodedBody)
    router(this.printer, { ...req, body: decodedBody }, res)
  }
}

function router (printer: Printer, req: PrinterRequest, res: ServerResponse) {
  var body = req.body

  debug('IPP/%d.%d operation %d (request #%d)',
    body.version.major,
    body.version.minor,
    body.operationId,
    body.requestId,
    util.inspect(body.groups, { depth: null }))

  const response = send.bind(null, printer, body, res)

  if (body.version.major !== 1) return response(C.SERVER_ERROR_VERSION_NOT_SUPPORTED)

  switch (body.operationId) {
    // Printer Operations
    case C.PRINT_JOB: return operations.printJob(printer, req, res)
    case C.VALIDATE_JOB: return operations.validateJob(printer, req, res)
    case C.GET_PRINTER_ATTRIBUTES: return operations.getPrinterAttributes(printer, req, res)
    case C.GET_JOBS: return operations.getJobs(printer, req, res)

    // Job Operations
    case C.CANCEL_JOB: return operations.cancelJob(printer, req, res)
    case C.GET_JOB_ATTRIBUTES: return operations.getJobAttributes(printer, req, res)

    default: response(C.SERVER_ERROR_OPERATION_NOT_SUPPORTED)
  }
}


