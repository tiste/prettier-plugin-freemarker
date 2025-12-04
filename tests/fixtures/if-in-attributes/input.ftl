<div class="container <#if isActive>active</#if> <#if isHighlighted>highlighted</#if>">
<a href="${baseUrl}<#if addParams>?id=${id}</#if>" class="<#if isPrimary>primary<#else>secondary</#if>">
<span>${text}</span>
</a>
<input type="text" value="${value}" disabled="<#if isDisabled>disabled</#if>" />
</div>
