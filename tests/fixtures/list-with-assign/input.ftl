<#assign count = 0 />
<#list items as item>
<#assign count = count + 1 />
<#assign itemClass = "item-" + count />
<div class="${itemClass}">
<span>${item.name}</span>
<#assign total = 0 />
<#list item.values as val>
<#assign total = total + val />
<span>${val}</span>
</#list>
<span class="total">Total: ${total}</span>
</div>
</#list>
<span>Processed ${count} items</span>
