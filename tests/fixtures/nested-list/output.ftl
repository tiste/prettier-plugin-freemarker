<#list items as item>
  <div>
    <span>${item.name}</span>
    <#if item.active>
      <span class="badge">Active</span>
    </#if>
  </div>
</#list>
