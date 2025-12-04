<#switch status>
  <#case "active">
    <span class="green">Active</span>
    <#break>
  <#case "pending">
    <span class="yellow">Pending</span>
    <#break>
  <#default>
    <span class="gray">Unknown</span>
</#switch>
