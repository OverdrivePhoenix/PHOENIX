# Architecture Specification — Project PHOENIX

## 1. System Topology

PHOENIX employs a split **Hybrid Control/Execution Architecture**:
* **Frontend & Shell:** Native Desktop Application (Tauri v2 / Windows `.exe`) featuring a frameless dark Graphite window, system tray ambient monitoring, native Windows Action Center notifications, global hotkey HUD, and direct RTX 5060 + Docker telemetry.
* **Cloud Control Plane:** FastAPI async service orchestrating multi-agent workflows using the OpenAI Agents SDK, Google Cloud Firestore (with real-time `onSnapshot` listeners and Firestore Vector Search), and a J.A.R.V.I.S.-style British butler voice gateway.
* **Deterministic Policy Engine:** Backend middleware verifying HMAC-SHA256 time-bound cryptographic tokens tied to exact canonical JSON payloads before authorizing high-risk operations.
* **Local Execution Node:** Outbound-initiated authenticated tunnel to the cloud plane. Sandboxes all untrusted code execution and test suites inside ephemeral Docker containers mounting per-project workspaces.

---

## 2. Trust Boundaries

1. **LLM as Generator, Backend as Guardrail:** Agents generate plans, diffs, and proposals, but have zero native authority to execute restricted operations.
2. **Zero-Trust Verification:** QA and Security Reviewer agents hold independent veto power over Software Engineer output.
3. **No Inbound Local Ports:** The workstation initiates outbound connections only; no firewall ports are opened.
4. **Cryptographic Token Lifecycle:** Modifying any parameter of an action payload invalidates the approval token signature.

---

## 3. Persistent Memory: Google Cloud Firestore + Vector Search

* **Projects Collection:** `projects/{projectId}`
* **Policies Subcollection:** `projects/{projectId}/policies/config`
* **Tasks Subcollection:** `projects/{projectId}/tasks/{taskId}`
* **Runs Subcollection:** `projects/{projectId}/tasks/{taskId}/runs/{runId}`
* **Approvals Collection:** `approvals/{approvalId}`
* **Audit Logs Collection:** `execution_logs/{logId}`
* **Knowledge Store:** `knowledge_documents/{docId}` with native vector search (`find_nearest`) on 768-dim / 1536-dim embeddings.

---

## 4. Voice Telephony: J.A.R.V.I.S. Butler Engine

* **Persona:** Modelled on Paul Bettany's J.A.R.V.I.S. from *Iron Man*. Dignified British RP accent, polite deference ("Sir"), understated dry wit.
* **Transport:** Twilio Voice SIP Media Streams via bidirectional WebSocket (linear PCM) connecting to OpenAI GPT-Live / Realtime API.
* **Mid-Call Authorization:** Verbal approvals directly invoke the cryptographic verification backend tool.
