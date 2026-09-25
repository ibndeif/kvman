import type { Problem } from '@kvman/protocol';
import type { Admission, PublishAdmission, PublishRequest, ReplyCheck, SendAdmission, SendRequest } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { AdmissionOptions } from './admission-context.ts';
import { admitPublish } from './publish-admission.ts';
import { admitQuery, type QueryAdmission, type QueryRequest } from './query-admission.ts';
import { checkReply } from './reply-check.ts';
import { admitSend } from './send-admission.ts';

// The router's admission (03 §3.3): sends and publishes inside a unit of work, and queries for the priority path.
export class Router implements Admission {
  readonly #options: AdmissionOptions;

  constructor(options: AdmissionOptions) {
    this.#options = options;
  }

  admitSend(connection: Connection, request: SendRequest): SendAdmission {
    return admitSend(this.#options, connection, request);
  }

  admitPublish(_connection: Connection, request: PublishRequest): PublishAdmission {
    return admitPublish(this.#options, request);
  }

  checkReply(check: ReplyCheck): Problem | undefined {
    return checkReply(this.#options, check);
  }

  admitQuery(request: QueryRequest): QueryAdmission {
    return admitQuery(this.#options, request);
  }
}
