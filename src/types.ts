import { IncomingMessage } from "http";
import { CONSTANTS as C } from 'ipp-encoder'

export type Attribute = {
  tag: string;
  name: string;
  value: any;
};

export type DecodedIppBody = {
  version: {
    major: number
    minor: number
  }
  operationId: C,
  requestId: string,
  groups: []
}

export interface PrinterRequest extends IncomingMessage {
  body: DecodedIppBody // decoded ipp body
}
