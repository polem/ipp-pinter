import { CONSTANTS as C } from 'ipp-encoder'
import utils from './utils'
import groups from './groups'
import once from 'once'
import Job from './job'
import Printer from './printer'
import { ClientRequest, IncomingMessage, ServerResponse } from 'http'

export default {
  printJob,
  validateJob,
  getPrinterAttributes,
  getJobs,
  cancelJob,
  getJobAttributes
}

function printJob (printer: Printer, req: IncomingMessage, res: ServerResponse) {
  const job = new Job(printer, req)
  const send = once(res.send)

  job.on('abort', function (statusCode) {
    send(statusCode)
  })

  req.on('end', function () {
    send({
      tag: C.JOB_ATTRIBUTES_TAG,
      attributes: job.attributes(['job-uri', 'job-id', 'job-state'])
    })
  })

  job.process()
}

function validateJob (printer: Printer, req, res) {
  // we could add a more elaborate form of validation, but for now it
  // must be ok that we were just able to parse the request
  res.send()
}

function getPrinterAttributes (printer: Printer, req: ClientRequest, res) {
  const requested = utils.requestedAttributes(req._body) || ['all']
  const attributes = printer.attributes(requested)
  const group1 = groups.unsupportedAttributesTag(attributes, requested)
  const group2 = groups.printerAttributesTag(attributes)
  res.send(group1.attributes.length > 0 ? [group1, group2] : [group2])
}

function getJobs (printer: Printer, req, res) {
  const attributes = utils.getAttributesForGroup(req._body, C.OPERATION_ATTRIBUTES_TAG)
  const limit = utils.getFirstValueForName(attributes, 'limit') || Infinity
  const which = utils.getFirstValueForName(attributes, 'which-jobs')
  let states: C[] = [];

  switch (which) {
    case 'completed':
      states = [C.JOB_COMPLETED, C.JOB_CANCELED, C.JOB_ABORTED]
      break
    case 'not-completed':
      states = [C.JOB_PENDING, C.JOB_PROCESSING, C.JOB_PROCESSING_STOPPED, C.JOB_PENDING_HELD]
      break
    case undefined:
      // all is good :)
      break
    default:
      res.send(
        C.CLIENT_ERROR_ATTRIBUTES_OR_VALUES_NOT_SUPPORTED,
        { tag: C.UNSUPPORTED_ATTRIBUTES_TAG, attributes: [
          { tag: C.UNSUPPORTED, name: 'which-jobs', value: which }
        ] }
      )
      return
  }

  const jobs = states
    ? printer.jobs.filter(function (job: Job) { return ~states.indexOf(job.state) })
    : printer.jobs

  const requested = utils.requestedAttributes(req._body) || ['job-uri', 'job-id']

  const _groups = jobs
    .sort(function (a: Job, b: Job) {
      if (a.completedAt && !b.completedAt) return -1
      if (!a.completedAt && b.completedAt) return 1
      if (!a.completedAt && !b.completedAt) return b.id - a.id
      return b.completedAt - b.completedAt
    })
    .slice(0, limit)
    .map((job: Job) => {
      const attributes = job.attributes(requested)
      return groups.jobAttributesTag(attributes)
    })

  if (_groups[0]) {
    const group = groups.unsupportedAttributesTag(_groups[0].attributes, requested)
    if (group.attributes.length > 0) _groups.unshift(group)
  }

  res.send(_groups)
}

function cancelJob (printer: Printer, req, res) {
  const job = utils.getJobFromRequest(printer, req._body)
  if (!job) return res.send(C.CLIENT_ERROR_NOT_FOUND)

  switch (job.state) {
    case C.JOB_PENDING:
    case C.JOB_PENDING_HELD:
    case C.JOB_PROCESSING:
    case C.JOB_PROCESSING_STOPPED:
      job.cancel()
      res.send(C.SUCCESSFUL_OK)
      break
    default:
      res.send(C.CLIENT_ERROR_NOT_POSSIBLE)
  }
}

function getJobAttributes (printer: Printer, req, res) {
  const job = utils.getJobFromRequest(printer, req._body)
  if (!job) return res.send(C.CLIENT_ERROR_NOT_FOUND)

  const requested = utils.requestedAttributes(req._body) || ['all']
  const attributes = job.attributes(requested)
  const group1 = groups.unsupportedAttributesTag(attributes, requested)
  const group2 = groups.jobAttributesTag(attributes)
  res.send(group1.attributes.length > 0 ? [group1, group2] : [group2])
}
