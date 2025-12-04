<#macro userCard user>
<div class="user-card">
<#if user.avatar??>
<img src="${user.avatar}" alt="${user.name}" />
<#else>
<div class="default-avatar">${user.name?substring(0, 1)}</div>
</#if>
<h3>${user.name}</h3>
<#switch user.status>
<#case "online">
<span class="status green">Online</span>
<#break>
<#case "away">
<span class="status yellow">Away</span>
<#break>
<#default>
<span class="status gray">Offline</span>
</#switch>
<#if user.roles?? && user.roles?size gt 0>
<ul class="roles">
<#list user.roles as role>
<li class="<#if role.primary>primary</#if>">
<#if role.icon??>
<i class="${role.icon}"></i>
</#if>
${role.name}
</li>
</#list>
</ul>
</#if>
</div>
</#macro>

<div class="users-container">
<#list users as user>
<#if user.active>
<@userCard user=user />
</#if>
</#list>
</div>
