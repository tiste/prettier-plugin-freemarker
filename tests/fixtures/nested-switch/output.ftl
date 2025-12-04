<#switch category>
  <#case "food">
    <div class="food">
      <#switch type>
        <#case "fruit">
          <span>Fruit</span>
          <#break>
        <#case "vegetable">
          <span>Vegetable</span>
          <#break>
        <#default>
          <span>Other food</span>
      </#switch>
    </div>
    <#break>
  <#case "drink">
    <div class="drink">
      <#switch type>
        <#case "hot">
          <span>Hot drink</span>
          <#break>
        <#case "cold">
          <span>Cold drink</span>
          <#break>
        <#default>
          <span>Unknown drink</span>
      </#switch>
    </div>
    <#break>
  <#default>
    <span>Unknown category</span>
</#switch>
