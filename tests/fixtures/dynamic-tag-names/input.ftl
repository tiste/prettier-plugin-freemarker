<#assign tagName = isPrimary?then("span", "div") />
<${tagName} class="box">
    <span class="title"><@i18n.translate "label.title" /></span>
    </${tagName}>
<section>after</section>
<${tagName}/>
<${tagName}>inline</${tagName}>
