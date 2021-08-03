import { CONSTANTS as C } from 'ipp-encoder'
import { Attribute } from './types';
import utils from './utils';

export default {
  operationAttributesTag,
  unsupportedAttributesTag,
  printerAttributesTag,
  jobAttributesTag
}

function operationAttributesTag (status: string) {
  return {
    tag: C.OPERATION_ATTRIBUTES_TAG,
    attributes: [
      { tag: C.CHARSET, name: 'attributes-charset', value: 'utf-8' },
      { tag: C.NATURAL_LANG, name: 'attributes-natural-language', value: 'en-us' },
      { tag: C.TEXT_WITH_LANG, name: 'status-message', value: { lang: 'en-us', value: status } }
    ]
  }
}

function unsupportedAttributesTag (attributes: Attribute[] = [], requested: [] = []) {
  return {
    tag: C.UNSUPPORTED_ATTRIBUTES_TAG,
    attributes: unsupportedAttributes(attributes, requested)
  }
}

function printerAttributesTag (attributes: Attribute[] = []) {
  return {
    tag: C.PRINTER_ATTRIBUTES_TAG,
    attributes: attributes
  }
}

function jobAttributesTag (attributes: Attribute[] = []) {
  return {
    tag: C.JOB_ATTRIBUTES_TAG,
    attributes: attributes
  }
}

function unsupportedAttributes (attributes: Attribute[] = [], requested: [] = []) {
  const supported = attributes.map(function (attr) {
    return attr.name
  })

  if (!requested) return []

  requested = utils.removeStandardAttributes(requested)

  return requested
    .filter(function (name) {
      return !~supported.indexOf(name)
    })
    .map(function (name) {
      return { tag: C.UNSUPPORTED, name: name, value: 'unsupported' }
    })
}
