/* global window */
(function (wp) {
    'use strict';

    const formats = [
        { name: 'accent', title: 'SonoRiva · Accent', icon: 'editor-bold' },
        { name: 'highlight', title: 'SonoRiva · Surlignage', icon: 'editor-textcolor' },
        { name: 'underline', title: 'SonoRiva · Souligné', icon: 'editor-underline' },
        { name: 'nuance', title: 'SonoRiva · Nuance', icon: 'editor-italic' }
    ];

    formats.forEach(function (format) {
        const type = 'sonoriva/text-' + format.name;
        wp.richText.registerFormatType(type, {
            title: format.title,
            tagName: 'span',
            className: 'sr-text-' + format.name,
            edit: function FormatButton(props) {
                return wp.element.createElement(wp.blockEditor.RichTextToolbarButton, {
                    title: format.title,
                    icon: format.icon,
                    isActive: props.isActive,
                    onClick: function () {
                        props.onChange(wp.richText.toggleFormat(props.value, { type: type }));
                    }
                });
            }
        });
    });
})(window.wp);
