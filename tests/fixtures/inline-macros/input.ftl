<#macro button text type="primary" disabled=false>
<button class="${type}" <#if disabled>disabled</#if>>${text}</button>
</#macro>

<#macro card title>
<div class="card">
<h3>${title}</h3>
<#nested>
</div>
</#macro>

<div class="container">
<@button text="Click me" />
<@button text="Submit" type="success" />
<@button text="Cancel" type="danger" disabled=true />

<@card title="My Card">
<p>Card content here</p>
<@button text="Action" />
</@card>
</div>
