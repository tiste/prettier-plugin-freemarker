<#list categories as category>
  <div class="category">
    <h2>${category.name}</h2>
    <#list category.items as item>
      <div class="item">
        <span>${item.name}</span>
        <#list item.variants as variant>
          <ul class="variants">
            <li>${variant.name} - ${variant.price}</li>
            <#list variant.sizes as size>
              <ul class="sizes">
                <li>${size}</li>
              </ul>
            </#list>
          </ul>
        </#list>
      </div>
    </#list>
  </div>
</#list>
