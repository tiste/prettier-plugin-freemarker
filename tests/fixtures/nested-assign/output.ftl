<#assign documentEventName>
  <#assign documentLabel = getTranslationOrEmpty("doc_${document.label?lower_case}_label") />
  <#if (documentLabel)?has_content>
    ${documentLabel}
  <#else>
    <@i18n.translate "doc_title" /> ${documentIndex}
  </#if>
</#assign>
