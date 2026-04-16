import type { LocustConfig } from "./locust-types";

function buildRuntimeConfig(config: LocustConfig): string {
  return JSON.stringify(config, null, 2);
}

export function generateSimpleScript(config: LocustConfig): string {
  const runtimeConfig = buildRuntimeConfig(config);

  return `import json
import math
from locust import HttpUser, task, constant, events

RUNTIME_CONFIG = json.loads(r'''${runtimeConfig}''')
SUMMARY_PATH = RUNTIME_CONFIG.get("summaryPath")
REQUEST_TIMEOUT_SECONDS = 30

REQUEST_COUNT = 0
STATUS_CODES = {}
TOTAL_BYTES = 0
LOGICAL_FAILURES = 0
OPERATION_STATS = {}
SUCCESS_STATUS_CODES = {"200", "201", "204", "301", "302", "303", "304"}

def ensure_operation_stats(name):
    operation_name = name or "Requisição Principal"
    if operation_name not in OPERATION_STATS:
        OPERATION_STATS[operation_name] = {
            "name": operation_name,
            "requests": 0,
            "errors": 0,
            "logicalFailures": 0,
            "statusCodes": {},
        }
    return OPERATION_STATS[operation_name]

def percentile(values, p):
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = max(0, math.ceil((p / 100) * len(sorted_values)) - 1)
    return float(sorted_values[index])

@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response=None, exception=None, **kwargs):
    global REQUEST_COUNT, TOTAL_BYTES
    REQUEST_COUNT += 1
    TOTAL_BYTES += int(response_length or 0)
    operation_stats = ensure_operation_stats(name)
    operation_stats["requests"] += 1

    status_code = 0
    if response is not None and getattr(response, "status_code", None) is not None:
        status_code = int(response.status_code)
    STATUS_CODES[str(status_code)] = STATUS_CODES.get(str(status_code), 0) + 1
    operation_stats["statusCodes"][str(status_code)] = operation_stats["statusCodes"].get(str(status_code), 0) + 1

    if exception is not None or str(status_code) not in SUCCESS_STATUS_CODES:
        operation_stats["errors"] += 1

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats_total = environment.stats.total
    duration = float(RUNTIME_CONFIG.get("duration") or 0)
    request_count = int(REQUEST_COUNT)
    failure_count = sum(
        count for code, count in STATUS_CODES.items() if code not in SUCCESS_STATUS_CODES
    )
    summary = {
        "avgLatency": float(stats_total.avg_response_time or 0.0),
        "minLatency": float(stats_total.min_response_time or 0.0),
        "p50Latency": float(stats_total.median_response_time or 0.0),
        "p90Latency": float(stats_total.get_response_time_percentile(0.90) or 0.0),
        "p95Latency": float(stats_total.get_response_time_percentile(0.95) or 0.0),
        "p99Latency": float(stats_total.get_response_time_percentile(0.99) or 0.0),
        "maxLatency": float(stats_total.max_response_time or 0.0),
        "rps": float(request_count / duration) if duration > 0 else 0.0,
        "totalReqs": request_count,
        "errorRate": float(failure_count / request_count) if request_count > 0 else 0.0,
        "statusCodes": STATUS_CODES,
        "duration": duration,
        "vus": int(RUNTIME_CONFIG.get("vus") or 0),
        "totalBytes": int(stats_total.total_content_length or TOTAL_BYTES),
        "throughputBytesPerSec": float((stats_total.total_content_length or TOTAL_BYTES) / duration) if duration > 0 else 0.0,
        "operationStats": OPERATION_STATS,
    }

    if SUMMARY_PATH:
        with open(SUMMARY_PATH, "w", encoding="utf-8") as summary_file:
            json.dump(summary, summary_file, ensure_ascii=False, indent=2)

class GeneratedUser(HttpUser):
    wait_time = constant(0)
    host = RUNTIME_CONFIG.get("host")

    @task
    def execute_request(self):
        with self.client.request(
            method=(RUNTIME_CONFIG.get("method") or "GET").upper(),
            url=RUNTIME_CONFIG["url"],
            headers=RUNTIME_CONFIG.get("headers"),
            data=RUNTIME_CONFIG.get("body"),
            name="Requisição Principal",
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=True,
            catch_response=True,
        ) as response:
            if response.status_code >= 400:
                response.failure(f"HTTP {response.status_code}")
            else:
                response.success()
`.trim();
}

export function generateFlowScript(config: LocustConfig): string {
  if (!config.flowOperations?.length) {
    return generateSimpleScript(config);
  }

  const runtimeConfig = buildRuntimeConfig(config);

  return `import json
import math
import random
import re
from locust import HttpUser, task, constant, events

RUNTIME_CONFIG = json.loads(r'''${runtimeConfig}''')
SUMMARY_PATH = RUNTIME_CONFIG.get("summaryPath")
REQUEST_TIMEOUT_SECONDS = 30

FLOW_OPERATIONS = RUNTIME_CONFIG.get("flowOperations") or []
FLOW_SELECTION_MODE = (RUNTIME_CONFIG.get("flowSelectionMode") or "random").lower()
FIRST_MODULE_INDEX = next(
    (
        index
        for index, operation in enumerate(FLOW_OPERATIONS)
        if isinstance(operation.get("moduleGroup"), str) and operation.get("moduleGroup", "").strip()
    ),
    -1,
)
AUTH_OPS = FLOW_OPERATIONS[:FIRST_MODULE_INDEX] if FIRST_MODULE_INDEX >= 0 else FLOW_OPERATIONS
MODULE_OPS = FLOW_OPERATIONS[FIRST_MODULE_INDEX:] if FIRST_MODULE_INDEX >= 0 else []
MODULE_FLOWS = []

for operation in MODULE_OPS:
    group_name = operation.get("moduleGroup") or operation.get("name")
    current_flow = MODULE_FLOWS[-1] if MODULE_FLOWS else None
    current_group_name = (
        current_flow[0].get("moduleGroup") or current_flow[0].get("name")
        if current_flow
        else None
    )
    if current_flow and current_group_name == group_name:
        current_flow.append(operation)
    else:
        MODULE_FLOWS.append([operation])

REQUEST_COUNT = 0
STATUS_CODES = {}
TOTAL_BYTES = 0
LOGICAL_FAILURES = 0
OPERATION_STATS = {}
SUCCESS_STATUS_CODES = {"200", "201", "204", "301", "302", "303", "304"}

def ensure_operation_stats(name):
    operation_name = name or "request"
    if operation_name not in OPERATION_STATS:
        OPERATION_STATS[operation_name] = {
            "name": operation_name,
            "requests": 0,
            "errors": 0,
            "logicalFailures": 0,
            "statusCodes": {},
        }
    return OPERATION_STATS[operation_name]

def register_logical_failure(name):
    stats = ensure_operation_stats(name)
    stats["logicalFailures"] += 1

def percentile(values, p):
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = max(0, math.ceil((p / 100) * len(sorted_values)) - 1)
    return float(sorted_values[index])

def build_url_signature(url_text):
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url_text)
        return {
            "path": (parsed.path or "").lower(),
            "query": parsed.query or "",
        }
    except Exception:
        return None

def has_unresolved_placeholders(value):
    return isinstance(value, str) and bool(re.search(r"\\{\\{[^}]+\\}\\}", value))

def resolve_template(value, variables):
    if not isinstance(value, str) or "{{" not in value:
        return value
    def replacement(match):
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return re.sub(r"\\{\\{(\\w+)\\}\\}", replacement, value)

def resolve_headers(headers, variables):
    if not headers:
        return None
    return {key: resolve_template(value, variables) for key, value in headers.items()}

def normalize_validation_text(value):
    text = str(value or "")
    text = re.sub(r"<script[\\s\\S]*?</script>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<style[\\s\\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    replacements = {
        "&nbsp;": " ",
        "&#160;": " ",
        "&amp;": "&",
        "&quot;": '"',
        "&#34;": '"',
        "&apos;": "'",
        "&#39;": "'",
        "&lt;": "<",
        "&gt;": ">",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"\\s+", " ", text).strip().lower()
    return text

def detect_login_like_content(value):
    normalized = normalize_validation_text(value)
    return (
        "bem vindo" in normalized and
        "nome" in normalized and
        "senha" in normalized
    )

@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response=None, exception=None, **kwargs):
    global REQUEST_COUNT, TOTAL_BYTES
    REQUEST_COUNT += 1
    TOTAL_BYTES += int(response_length or 0)
    operation_stats = ensure_operation_stats(name)
    operation_stats["requests"] += 1

    status_code = 0
    if response is not None and getattr(response, "status_code", None) is not None:
        status_code = int(response.status_code)
    STATUS_CODES[str(status_code)] = STATUS_CODES.get(str(status_code), 0) + 1
    operation_stats["statusCodes"][str(status_code)] = operation_stats["statusCodes"].get(str(status_code), 0) + 1

    if exception is not None or str(status_code) not in SUCCESS_STATUS_CODES:
        operation_stats["errors"] += 1

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    global LOGICAL_FAILURES
    stats_total = environment.stats.total
    duration = float(RUNTIME_CONFIG.get("duration") or 0)
    request_count = int(REQUEST_COUNT)
    status_failure_count = sum(
        count for code, count in STATUS_CODES.items() if code not in SUCCESS_STATUS_CODES
    )
    failure_count = int(status_failure_count + LOGICAL_FAILURES)
    summary = {
        "avgLatency": float(stats_total.avg_response_time or 0.0),
        "minLatency": float(stats_total.min_response_time or 0.0),
        "p50Latency": float(stats_total.median_response_time or 0.0),
        "p90Latency": float(stats_total.get_response_time_percentile(0.90) or 0.0),
        "p95Latency": float(stats_total.get_response_time_percentile(0.95) or 0.0),
        "p99Latency": float(stats_total.get_response_time_percentile(0.99) or 0.0),
        "maxLatency": float(stats_total.max_response_time or 0.0),
        "rps": float(request_count / duration) if duration > 0 else 0.0,
        "totalReqs": request_count,
        "errorRate": float(failure_count / request_count) if request_count > 0 else 0.0,
        "statusCodes": STATUS_CODES,
        "duration": duration,
        "vus": int(RUNTIME_CONFIG.get("vus") or 0),
        "totalBytes": int(stats_total.total_content_length or TOTAL_BYTES),
        "throughputBytesPerSec": float((stats_total.total_content_length or TOTAL_BYTES) / duration) if duration > 0 else 0.0,
        "operationStats": OPERATION_STATS,
    }

    if SUMMARY_PATH:
        with open(SUMMARY_PATH, "w", encoding="utf-8") as summary_file:
            json.dump(summary, summary_file, ensure_ascii=False, indent=2)

class GeneratedUser(HttpUser):
    wait_time = constant(0)
    host = RUNTIME_CONFIG.get("host")

    def on_start(self):
        self.variables = {}
        self.authenticated = False
        self.next_flow_index = 0
        self.login_signature = build_url_signature(AUTH_OPS[0].get("url")) if AUTH_OPS else None
        if AUTH_OPS:
            self.authenticated = self.run_auth()

    def run_auth(self):
        for operation in AUTH_OPS:
            outcome = self.execute_operation(operation)
            if outcome.get("session_invalid"):
                self.authenticated = False
                return False
        self.authenticated = True
        return True

    def reset_session(self):
        self.variables = {}
        self.authenticated = False

    def select_flow(self):
        if not MODULE_FLOWS:
            return None
        if FLOW_SELECTION_MODE == "deterministic":
            flow = MODULE_FLOWS[self.next_flow_index % len(MODULE_FLOWS)]
            self.next_flow_index += 1
            return flow
        return random.choice(MODULE_FLOWS)

    def execute_operation(self, operation):
        global LOGICAL_FAILURES
        operation_name = operation.get("name") or "request"
        url = resolve_template(operation.get("url"), self.variables)
        headers = resolve_headers(operation.get("headers"), self.variables)
        body = resolve_template(operation.get("body"), self.variables) if operation.get("body") is not None else None

        if has_unresolved_placeholders(url) or has_unresolved_placeholders(body):
            return {"session_invalid": True}
        if headers and any(has_unresolved_placeholders(value) for value in headers.values()):
            return {"session_invalid": True}

        request_kwargs = {
            "method": (operation.get("method") or "GET").upper(),
            "url": url,
            "headers": headers,
            "name": operation.get("name") or "request",
            "timeout": REQUEST_TIMEOUT_SECONDS,
            "allow_redirects": True,
            "catch_response": True,
        }
        if body is not None and request_kwargs["method"] != "GET":
            request_kwargs["data"] = body

        session_invalid = False
        try:
            with self.client.request(**request_kwargs) as response:
                if response.status_code >= 400:
                    response.failure(f"HTTP {response.status_code}")
                    return {"session_invalid": False}

                if operation.get("extractors") and response.text:
                    missing_extractors = []
                    for extractor in operation.get("extractors") or []:
                        try:
                            match = re.search(extractor.get("regex"), response.text)
                            if match and match.group(1):
                                self.variables[extractor.get("varName")] = match.group(1)
                            else:
                                missing_extractors.append(extractor.get("varName"))
                        except Exception:
                            missing_extractors.append(extractor.get("varName"))

                    if missing_extractors:
                        session_invalid = True
                        LOGICAL_FAILURES += 1
                        register_logical_failure(operation_name)
                        response.failure(
                            "Extractor(es) ausente(s): " + ", ".join(
                                str(name) for name in missing_extractors if name
                            )
                        )

                if operation.get("rejectTexts") and response.text:
                    for text in operation.get("rejectTexts") or []:
                        if text and text in response.text:
                            session_invalid = True
                            LOGICAL_FAILURES += 1
                            register_logical_failure(operation_name)
                            response.failure(f"Texto de sessão inválida detectado: {text}")
                            break

                reject_login_like_content = (
                    operation.get("rejectLoginLikeContent")
                    if operation.get("rejectLoginLikeContent") is not None
                    else operation.get("name") != "Página de Login"
                )
                if (
                    not session_invalid
                    and reject_login_like_content
                    and response.text
                    and detect_login_like_content(response.text)
                ):
                    session_invalid = True
                    LOGICAL_FAILURES += 1
                    register_logical_failure(operation_name)
                    response.failure("A resposta parece a tela de login do MisterT")

                expected_texts = operation.get("expectedTexts") or []
                if (
                    not session_invalid
                    and expected_texts
                    and response.text
                ):
                    normalized_body = normalize_validation_text(response.text)
                    matched = any(
                        normalize_validation_text(candidate) in normalized_body
                        for candidate in expected_texts
                        if candidate
                    )
                    if not matched:
                        session_invalid = True
                        LOGICAL_FAILURES += 1
                        register_logical_failure(operation_name)
                        response.failure("Nenhum texto esperado foi encontrado na resposta")

                final_signature = build_url_signature(response.url or url)
                if (
                    not session_invalid
                    and self.login_signature
                    and final_signature
                    and final_signature["path"] == self.login_signature["path"]
                    and final_signature["query"] == self.login_signature["query"]
                    and operation.get("name") != AUTH_OPS[0].get("name")
                ):
                    session_invalid = True
                    LOGICAL_FAILURES += 1
                    register_logical_failure(operation_name)
                    response.failure("Sessão expirada ou redirecionada para login")

                if not session_invalid:
                    response.success()

                return {"session_invalid": session_invalid}
        except Exception:
            return {"session_invalid": True}

    @task
    def run_generated_flow(self):
        if not self.authenticated:
            if not self.run_auth():
                return

        if not MODULE_FLOWS:
            for operation in AUTH_OPS:
                self.execute_operation(operation)
            return

        flow = self.select_flow()
        if not flow:
            return
        session_invalid = False

        for operation in flow:
            outcome = self.execute_operation(operation)
            if outcome.get("session_invalid"):
                session_invalid = True
                break

        if session_invalid:
            self.reset_session()
            self.run_auth()
`.trim();
}
