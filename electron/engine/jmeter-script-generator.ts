import type { JMeterConfig } from "./jmeter-types";

const CONTROL_SAMPLE_NAMES = {
  authPrepare: "Prepare Auth State",
  authFinalize: "Finalize Auth State",
  flowSelector: "Select Flow Deterministically",
} as const;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toJMeterVarSyntax(value: string): string {
  return value.replace(/\{\{(\w+)\}\}/g, "${$1}");
}

function toGroovyString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function splitUrl(urlText: string) {
  const parsed = new URL(urlText);
  return {
    protocol: parsed.protocol.replace(":", ""),
    domain: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    path: `${parsed.pathname}${parsed.search}`,
  };
}

function buildHeaderManager(
  headers: Record<string, string> | undefined,
  indent: string,
): string {
  if (!headers || Object.keys(headers).length === 0) {
    return `${indent}<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true"><collectionProp name="HeaderManager.headers"/></HeaderManager>\n${indent}<hashTree/>`;
  }

  const headerElements = Object.entries(headers)
    .map(
      ([key, value]) =>
        `${indent}    <elementProp name="" elementType="Header"><stringProp name="Header.name">${xmlEscape(
          key,
        )}</stringProp><stringProp name="Header.value">${xmlEscape(
          value,
        )}</stringProp></elementProp>`,
    )
    .join("\n");

  return `${indent}<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true"><collectionProp name="HeaderManager.headers">\n${headerElements}\n${indent}  </collectionProp></HeaderManager>\n${indent}<hashTree/>`;
}

function buildRegexExtractors(
  extractors:
    | Array<{
        varName: string;
        regex: string;
      }>
    | undefined,
  indent: string,
): string {
  if (!extractors || extractors.length === 0) return "";

  return extractors
    .map(
      (extractor) =>
        `${indent}<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="Regex ${xmlEscape(
          extractor.varName,
        )}" enabled="true"><stringProp name="RegexExtractor.useHeaders">false</stringProp><stringProp name="RegexExtractor.refname">${xmlEscape(
          extractor.varName,
        )}</stringProp><stringProp name="RegexExtractor.regex">${xmlEscape(
          extractor.regex,
        )}</stringProp><stringProp name="RegexExtractor.template">$1$</stringProp><stringProp name="RegexExtractor.default">__MISSING__</stringProp><stringProp name="RegexExtractor.match_number">1</stringProp></RegexExtractor>\n${indent}<hashTree/>`,
    )
    .join("\n");
}

function buildJsr223Element(
  testClass: "JSR223Assertion" | "JSR223Sampler",
  testName: string,
  script: string,
  indent: string,
): string {
  return `${indent}<${testClass} guiclass="TestBeanGUI" testclass="${testClass}" testname="${xmlEscape(
    testName,
  )}" enabled="true"><stringProp name="cacheKey">${xmlEscape(
    testName,
  )}</stringProp><stringProp name="filename"></stringProp><stringProp name="parameters"></stringProp><stringProp name="script">${xmlEscape(
    script,
  )}</stringProp><stringProp name="scriptLanguage">groovy</stringProp></${testClass}>\n${indent}<hashTree/>`;
}

function buildValidationAssertion(
  operation: NonNullable<JMeterConfig["flowOperations"]>[number],
  indent: string,
): string {
  const extractorNames = (operation.extractors || []).map(
    (extractor) => extractor.varName,
  );
  const rejectTexts = operation.rejectTexts || [];
  const expectedTexts = operation.expectedTexts || [];
  const rejectLoginLikeContent =
    typeof operation.rejectLoginLikeContent === "boolean"
      ? operation.rejectLoginLikeContent
      : operation.name !== "Página de Login";

  if (
    extractorNames.length === 0 &&
    rejectTexts.length === 0 &&
    expectedTexts.length === 0 &&
    !rejectLoginLikeContent
  ) {
    return "";
  }

  const script = [
    "def responseText = prev.getResponseDataAsString() ?: ''",
    "def normalized = responseText",
    "  .replaceAll('(?is)<script[\\\\s\\\\S]*?</script>', ' ')",
    "  .replaceAll('(?is)<style[\\\\s\\\\S]*?</style>', ' ')",
    "  .replaceAll('(?is)<[^>]+>', ' ')",
    "  .replace('&nbsp;', ' ')",
    "  .replace('&#160;', ' ')",
    "  .replace('&amp;', '&')",
    "  .replace('&quot;', '\"')",
    "  .replace('&#34;', '\"')",
    "  .replace('&apos;', " + toGroovyString("'") + ")",
    "  .replace('&#39;', " + toGroovyString("'") + ")",
    "  .replace('&lt;', '<')",
    "  .replace('&gt;', '>')",
    "  .replaceAll('\\\\s+', ' ')",
    "  .trim()",
    "  .toLowerCase()",
    "def fail = { String message, boolean markSessionInvalid ->",
    "  prev.setSuccessful(false)",
    "  prev.setResponseMessage(message)",
    "  AssertionResult.setFailure(true)",
    "  AssertionResult.setFailureMessage(message)",
    "  if (markSessionInvalid) {",
    "    vars.put('CPX_REAUTH', 'true')",
    "    vars.put('CPX_AUTH_DONE', 'false')",
    "  }",
    "}",
  ];

  if (extractorNames.length > 0) {
    script.push(
      `def missingExtractors = [${extractorNames
        .map((name) => toGroovyString(name))
        .join(", ")}].findAll { (vars.get(it) ?: '') == '__MISSING__' }`,
      "if (!missingExtractors.isEmpty()) {",
      "  fail('Extractor(es) ausente(s): ' + missingExtractors.join(', '), true)",
      "  return",
      "}",
    );
  }

  if (rejectTexts.length > 0) {
    script.push(
      `for (String text : [${rejectTexts.map((text) => toGroovyString(text)).join(", ")}]) {`,
      "  if (normalized.contains(text.toLowerCase())) {",
      "    fail('Texto de sessão inválida detectado: ' + text, true)",
      "    return",
      "  }",
      "}",
    );
  }

  if (rejectLoginLikeContent) {
    script.push(
      "if (normalized.contains('bem vindo') && normalized.contains('nome') && normalized.contains('senha')) {",
      "  fail('A resposta parece a tela de login do MisterT', true)",
      "  return",
      "}",
    );
  }

  if (expectedTexts.length > 0) {
    script.push(
      `def expectedMatch = [${expectedTexts
        .map((text) => toGroovyString(text))
        .join(", ")}].any { normalized.contains(it.toLowerCase()) }`,
      "if (!expectedMatch) {",
      "  fail('Nenhum texto esperado foi encontrado na resposta', true)",
      "  return",
      "}",
    );
  }

  return buildJsr223Element(
    "JSR223Assertion",
    `${operation.name} Validation`,
    script.join("\n"),
    indent,
  );
}

function buildAuthStateSampler(
  testName: string,
  script: string,
  indent: string,
): string {
  return buildJsr223Element("JSR223Sampler", testName, script, indent);
}

function buildSampler(
  operation: NonNullable<JMeterConfig["flowOperations"]>[number],
  index: number,
  requestTimeoutMs: number,
): string {
  const url = splitUrl(toJMeterVarSyntax(operation.url));
  const body = operation.body ? toJMeterVarSyntax(operation.body) : "";
  const bodyArguments = body
    ? `<boolProp name="HTTPSampler.postBodyRaw">true</boolProp><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"><elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">${xmlEscape(
        body,
      )}</stringProp><stringProp name="Argument.metadata">=</stringProp></elementProp></collectionProp></elementProp>`
    : `<elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp>`;

  const headerManager = buildHeaderManager(operation.headers, "              ");
  const regexExtractors = buildRegexExtractors(operation.extractors, "              ");
  const validationAssertion = buildValidationAssertion(operation, "              ");

  return `          <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEscape(
            operation.name || `Request ${index + 1}`,
          )}" enabled="true">${bodyArguments}<stringProp name="HTTPSampler.domain">${xmlEscape(
            url.domain,
          )}</stringProp><stringProp name="HTTPSampler.port">${xmlEscape(
            url.port,
          )}</stringProp><stringProp name="HTTPSampler.protocol">${xmlEscape(
            url.protocol,
          )}</stringProp><stringProp name="HTTPSampler.path">${xmlEscape(
            url.path,
          )}</stringProp><stringProp name="HTTPSampler.method">${xmlEscape(
            operation.method.toUpperCase(),
          )}</stringProp><boolProp name="HTTPSampler.follow_redirects">true</boolProp><boolProp name="HTTPSampler.auto_redirects">false</boolProp><boolProp name="HTTPSampler.use_keepalive">true</boolProp><boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp><stringProp name="HTTPSampler.connect_timeout">${requestTimeoutMs}</stringProp><stringProp name="HTTPSampler.response_timeout">${requestTimeoutMs}</stringProp></HTTPSamplerProxy>
          <hashTree>
${headerManager}
${regexExtractors ? `${regexExtractors}\n` : ""}${validationAssertion ? `${validationAssertion}\n` : ""}          </hashTree>`;
}

function buildFlowController(
  flowName: string,
  operations: NonNullable<JMeterConfig["flowOperations"]>,
  requestTimeoutMs: number,
): string {
  const samplers = operations
    .map((operation, index) => buildSampler(operation, index, requestTimeoutMs))
    .join("\n");

  return `        <GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="${xmlEscape(
    flowName,
  )}" enabled="true"></GenericController>
        <hashTree>
${samplers}
        </hashTree>`;
}

function buildDeterministicFlowController(
  flowName: string,
  operations: NonNullable<JMeterConfig["flowOperations"]>,
  flowIndex: number,
  requestTimeoutMs: number,
): string {
  return `        <IfController guiclass="IfControllerPanel" testclass="IfController" testname="${xmlEscape(
    `${flowName} When Selected`,
  )}" enabled="true"><stringProp name="IfController.condition">${xmlEscape(
    `\${__groovy(vars.get('CPX_SELECTED_FLOW') == '${flowIndex}')}`,
  )}</stringProp><boolProp name="IfController.evaluateAll">false</boolProp><boolProp name="IfController.useExpression">true</boolProp></IfController>
        <hashTree>
${buildFlowController(flowName, operations, requestTimeoutMs)}
        </hashTree>`;
}

function buildDeterministicFlowSelector(flowCount: number): string {
  return buildAuthStateSampler(
    CONTROL_SAMPLE_NAMES.flowSelector,
    [
      `def flowCount = ${flowCount}`,
      "if (flowCount <= 0) {",
      "  return",
      "}",
      "def nextIndex = (vars.get('CPX_NEXT_FLOW_INDEX') ?: '0') as int",
      "def selected = Math.floorMod(nextIndex, flowCount)",
      "vars.put('CPX_SELECTED_FLOW', String.valueOf(selected))",
      "vars.put('CPX_NEXT_FLOW_INDEX', String.valueOf(Math.floorMod(nextIndex + 1, flowCount)))",
    ].join("\n"),
    "          ",
  );
}

export function generateJMeterPlan(config: JMeterConfig): string {
  const requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
  const operations = config.flowOperations?.length
    ? config.flowOperations
    : [
        {
          name: "Requisição Principal",
          method: config.method || "GET",
          url: config.url,
          headers: config.headers,
          body: config.body,
        },
      ];

  const rampTime = Math.max(1, config.rampUpSeconds || config.vus);
  const firstModuleIndex = operations.findIndex(
    (operation) =>
      typeof operation.moduleGroup === "string" &&
      operation.moduleGroup.trim() !== "",
  );
  const authOps =
    firstModuleIndex >= 0 ? operations.slice(0, firstModuleIndex) : operations;
  const moduleOps =
    firstModuleIndex >= 0 ? operations.slice(firstModuleIndex) : [];
  const moduleFlows: NonNullable<JMeterConfig["flowOperations"]>[] = [];

  for (const operation of moduleOps) {
    const groupName = operation.moduleGroup || operation.name;
    const currentFlow = moduleFlows[moduleFlows.length - 1];
    const currentGroupName =
      currentFlow && currentFlow.length > 0
        ? currentFlow[0].moduleGroup || currentFlow[0].name
        : null;

    if (currentFlow && currentGroupName === groupName) {
      currentFlow.push(operation);
    } else {
      moduleFlows.push([operation]);
    }
  }

  const authSamplers = authOps
    .map((operation, index) => buildSampler(operation, index, requestTimeoutMs))
    .join("\n");
  const randomFlows = moduleFlows
    .map((flow) =>
      buildFlowController(
        `${flow[0].moduleGroup || flow[0].name} Flow`,
        flow,
        requestTimeoutMs,
      ),
    )
    .join("\n");
  const fallbackSamplers = operations
    .map((operation, index) => buildSampler(operation, index, requestTimeoutMs))
    .join("\n");
  const authPrepareSampler = buildAuthStateSampler(
    CONTROL_SAMPLE_NAMES.authPrepare,
    [
      "vars.put('CPX_REAUTH', 'false')",
      "vars.put('CPX_AUTH_DONE', 'false')",
    ].join("\n"),
    "          ",
  );
  const authFinalizeSampler = buildAuthStateSampler(
    CONTROL_SAMPLE_NAMES.authFinalize,
    [
      "if ('true'.equals(vars.get('CPX_REAUTH'))) {",
      "  vars.put('CPX_AUTH_DONE', 'false')",
      "} else {",
      "  vars.put('CPX_AUTH_DONE', 'true')",
      "}",
    ].join("\n"),
    "          ",
  );
  const deterministicFlows = moduleFlows
    .map((flow, index) =>
      buildDeterministicFlowController(
        `${flow[0].moduleGroup || flow[0].name} Flow`,
        flow,
        index,
        requestTimeoutMs,
      ),
    )
    .join("\n");
  const threadTree =
    moduleFlows.length > 0
      ? `        <IfController guiclass="IfControllerPanel" testclass="IfController" testname="Authenticate If Needed" enabled="true"><stringProp name="IfController.condition">${xmlEscape("${__groovy(vars.get('CPX_AUTH_DONE') != 'true' || vars.get('CPX_REAUTH') == 'true')}")}</stringProp><boolProp name="IfController.evaluateAll">false</boolProp><boolProp name="IfController.useExpression">true</boolProp></IfController>
        <hashTree>
${authPrepareSampler}
${authSamplers}
${authFinalizeSampler}
        </hashTree>
${config.flowSelectionMode === "deterministic" ? `${buildDeterministicFlowSelector(moduleFlows.length)}
${deterministicFlows}` : `        <RandomController guiclass="LogicControllerGui" testclass="RandomController" testname="Random Module Flow" enabled="true"></RandomController>
        <hashTree>
${randomFlows}
        </hashTree>`}`
      : fallbackSamplers;

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="CPX-Stress Generated Plan" enabled="true">
      <stringProp name="TestPlan.comments"></stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Generated Thread Group" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">true</boolProp>
          <stringProp name="LoopController.loops">-1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${config.vus}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${rampTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${config.duration}</stringProp>
        <stringProp name="ThreadGroup.delay">0</stringProp>
      </ThreadGroup>
      <hashTree>
        <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
          <collectionProp name="CookieManager.cookies"/>
          <boolProp name="CookieManager.clearEachIteration">false</boolProp>
        </CookieManager>
        <hashTree/>
${threadTree}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
`;
}
