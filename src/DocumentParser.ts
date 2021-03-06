
module docx {
    export var autos = {
        shd: "white",
        color: "black",
        highlight: "transparent"
    };

    export class DocumentParser {
        // removes XML declaration 
        skipDeclaration: boolean = true;
        
         // ignores page and table sizes
        ignoreWidth: boolean = false;
        ignoreHeight: boolean = true; 
        debug: boolean = false;

        parseDocumentRelationsFile(xmlString) {
            var xrels = xml.parse(xmlString, this.skipDeclaration);

            return xml.nodes(xrels).map(c => <IDomRelationship>{
                id: xml.stringAttr(c, "Id"),
                type: values.valueOfRelType(c),
                target: xml.stringAttr(c, "Target"),
            });
        }

        parseDocumentFile(xmlString) {
            var result: IDomDocument = {
                domType: DomType.Document,
                children: [],
                style: {}
            };

            var xbody = xml.byTagName(xml.parse(xmlString, this.skipDeclaration), "body");

            for (var i = 0; i < xbody.childNodes.length; i++) {
                var node = xbody.childNodes[i];

                switch (node.localName) {
                    case "p":
                        result.children.push(this.parseParagraph(node));
                        break;

                    case "tbl":
                        result.children.push(this.parseTable(node));
                        break;

                    case "sectPr":
                        this.parseSectionProperties(node, result);
                        break;
                }
            }

            return result;
        }

        parseStylesFile(xmlString: string): IDomStyle[] {
            var result = [];

            var xstyles = xml.parse(xmlString, this.skipDeclaration);

            xml.foreach(xstyles, n => {
                switch (n.localName) {
                    case "style":
                        result.push(this.parseStyle(n));
                        break;

                    case "docDefaults":
                        result.push(this.parseDefaultStyles(n));
                        break;
                }
            });

            return result;
        }

        parseDefaultStyles(node: Node): IDomStyle {
            var result = {
                id: null,
                name: null,
                target: null,
                basedOn: null,
                styles: []
            };

            xml.foreach(node, c => {
                switch(c.localName) {
                    case "rPrDefault": 
                        var rPr = xml.byTagName(c, "rPr");
                        
                        if(rPr)
                            result.styles.push({
                                target: "span",
                                values: this.parseDefaultProperties(rPr, {})
                            });
                        break;

                    case "pPrDefault": 
                        var pPr = xml.byTagName(c, "pPr");

                        if(pPr)
                            result.styles.push({
                                target: "p",
                                values: this.parseDefaultProperties(pPr, {})
                            });
                        break;
                }
            });

            return result;
        }

        parseStyle(node: Node): IDomStyle {
            var result = <IDomStyle>{
                id: xml.className(node, "styleId"),
                isDefault: xml.boolAttr(node, "default"),
                name: null,
                target: null,
                basedOn: null,
                styles: []
            };

            switch (xml.stringAttr(node, "type")) {
                case "paragraph": result.target = "p"; break;
                case "table": result.target = "table"; break;
                case "character": result.target = "span"; break;
            }

            xml.foreach(node, n => {
                switch (n.localName) {
                    case "basedOn":
                        result.basedOn = xml.stringAttr(n, "val");
                        break;

                    case "name":
                        result.name = xml.stringAttr(n, "val");
                        break;

                    case "pPr":
                        result.styles.push({
                            target: "p",
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;

                    case "rPr":
                        result.styles.push({
                            target: "span",
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;

                    case "tblPr":
                    case "tcPr":
                        result.styles.push({
                            target: "td", //TODO: maybe move to processor
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;

                    case "tblStylePr":
                        for(let s of this.parseTableStyle(n))
                            result.styles.push(s);
                        break;

                    case "rsid":
                    case "qFormat":
                    case "hidden":
                    case "semiHidden":
                    case "unhideWhenUsed":
                    case "autoRedefine":
                    case "uiPriority":
                        //TODO: ignore
                        break;
    
                    default:
                    this.debug && console.warn(`DOCX: Unknown style element: ${n.localName}`);
                }
            });

            return result;
        }

        parseTableStyle(node: Node): IDomSubStyle[] {
            var result = [];

            var type = xml.stringAttr(node, "type");
            var selector = "";

            switch(type){
                case "firstRow": selector = "tr.first-row"; break;
                case "lastRow": selector = "tr.last-row"; break;
                case "firstCol": selector = "td.first-col"; break;
                case "lastCol": selector = "td.last-col"; break;
                case "band1Vert": selector = "td.odd-col"; break;
                case "band2Vert": selector = "td.even-col"; break;
                case "band1Horz": selector = "tr.odd-row"; break;
                case "band2Horz": selector = "tr.even-row"; break;
                default: return [];
            }

            xml.foreach(node, n => {
                switch (n.localName) {
                    case "pPr":
                        result.push({
                            target: selector + " p",
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;

                    case "rPr":
                        result.push({
                            target: selector + " span",
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;

                    case "tblPr":
                    case "tcPr":
                        result.push({
                            target: selector, //TODO: maybe move to processor
                            values: this.parseDefaultProperties(n, {})
                        });
                        break;
                }
            });

            return result;
        }

        parseNumberingFile(xmlString: string): IDomNumbering[] {
            var result = [];
            var xnums = xml.parse(xmlString, this.skipDeclaration);
            
            var mapping = {};
            var bullets = [];

            xml.foreach(xnums, n => {
                switch(n.localName){
                    case "abstractNum":
                        this.parseAbstractNumbering(n, bullets)
                            .forEach(x => result.push(x));
                        break;

                    case "numPicBullet":
                        bullets.push(this.parseNumberingPicBullet(n));
                        break;

                    case "num":
                        var numId = xml.stringAttr(n, "numId");
                        var abstractNumId = xml.nodeStringAttr(n, "abstractNumId", "val");
                        mapping[abstractNumId] = numId;
                        break;
                }
            });

            result.forEach(x => x.id = mapping[x.id]);

            return result;
        }

        parseNumberingPicBullet(node: Node): NumberingPicBullet {
            var pict = xml.byTagName(node, "pict");
            var shape = pict && xml.byTagName(pict, "shape");
            var imagedata = shape && xml.byTagName(shape, "imagedata");

            return imagedata ? {
                id: xml.intAttr(node, "numPicBulletId"),
                src: xml.stringAttr(imagedata, "id"),
                style: xml.stringAttr(shape, "style")
            } : null;
        }

        parseAbstractNumbering(node: Node, bullets: any[]): IDomNumbering[] {
            var result = [];
            var id = xml.stringAttr(node, "abstractNumId"); 

            xml.foreach(node, n => {
                switch (n.localName) {
                    case "lvl":
                        result.push(this.parseNumberingLevel(id, n, bullets));
                        break;
                }
            });

            return result;
        }

	    parseNumberingLevel(id: string, node: Node, bullets: any[]): IDomNumbering {
            var result: IDomNumbering = {
                id: id,
                level: xml.intAttr(node, "ilvl"),
                style: {}
            }; 

            xml.foreach(node, n => {
                switch (n.localName) {
                    case "pPr":
                        this.parseDefaultProperties(n, result.style);
                        break;

                    case "lvlPicBulletId":
                        var id = xml.intAttr(n, "val");
                        result.bullet = bullets.filter(x => x.id == id)[0];
                        break;
                    
                    case "lvlText":
                        result.levelText = xml.stringAttr(n, "val");
                        break;

                    case "numFmt":
                        result.format = xml.stringAttr(n, "val");
                        break;
                }
            });

            return result;
        }

        parseSectionProperties(node: Node, elem: IDomElement) {
            xml.foreach(node, n => {
                switch (n.localName) {
                    case "pgMar":
                        elem.style["padding-left"] = xml.sizeAttr(n, "left");
                        elem.style["padding-right"] = xml.sizeAttr(n, "right");
                        elem.style["padding-top"] = xml.sizeAttr(n, "top");
                        elem.style["padding-bottom"] = xml.sizeAttr(n, "bottom");
                        break;

	                case "pgSz":
                        if(!this.ignoreWidth)
                            elem.style["width"] = xml.sizeAttr(n, "w");

                        if(!this.ignoreHeight)
                            elem.style["height"] = xml.sizeAttr(n, "h");
                        break;
                }
            });
        }

        parseParagraph(node: Node): IDomElement {
            var result = <IDomParagraph>{ domType: DomType.Paragraph, children: [] };

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "r":
                        result.children.push(this.parseRun(c, result));
                        break;

                    case "hyperlink":
                        result.children.push(this.parseHyperlink(c, result));
                        break;

                    case "bookmarkStart":
                        result.children.push(this.parseBookmark(c));
                        break;

                    case "pPr":
                        this.parseParagraphProperties(c, result);
                        break;
                }
            });

            return result;
        }

        parseParagraphProperties(node: Node, paragraph: IDomParagraph) {
            this.parseDefaultProperties(node, paragraph.style = {}, null, c => {
                switch (c.localName) {
                    case "pStyle":
                        paragraph.className = xml.className(c, "val");
                        break;
                    
                    case "numPr":
                        this.parseNumbering(c, paragraph);
                        break;

                    case "framePr":
                        this.parseFrame(c, paragraph);
                        break;

                    case "tabs":
                        this.parseTabs(c, paragraph);
                        break;

                    case "rPr":
                        //TODO ignore
                        break;

                    default:
                        return false;
                }

                return true;
            });
        }

        parseNumbering(node: Node, paragraph: IDomParagraph){
             xml.foreach(node, c => {
                switch (c.localName) {
                    case "numId":
                        paragraph.numberingId = xml.stringAttr(c, "val");
                        break;

                    case "ilvl":
                        paragraph.numberingLevel = xml.intAttr(c, "val");
                        break;
                }
            });
        }

        parseFrame(node: Node, paragraph: IDomParagraph){
            var dropCap = xml.stringAttr(node, "dropCap");

            if(dropCap == "drop")
                paragraph.style["float"] = "left";
        }

        parseBookmark(node: Node): IDomElement {
            var result: IDomRun = { domType: DomType.Run };

            result.id = xml.stringAttr(node, "name");

            return result;
        }

        parseHyperlink(node: Node, parent?: IDomElement): IDomRun {
            var result: IDomHyperlink = { domType: DomType.Hyperlink, parent: parent, children: [] };
            var anchor = xml.stringAttr(node, "anchor");

            if(anchor)
                result.href = "#" + anchor;   

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "r":
                        result.children.push(this.parseRun(c, result));
                        break;
                }
            });     
            
            return result;
        }

        parseRun(node: Node, parent?: IDomElement): IDomRun {
            var result: IDomRun = { domType: DomType.Run, parent: parent };

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "t":
                        result.text = c.textContent;//.replace(" ", "\u00A0"); // TODO
                        break;

                    case "br":
                        result.break = xml.stringAttr(c, "type") || "textWrapping";
                        break;

                    case "tab":
                        result.tab = true;
                        //result.text = "\u00A0\u00A0\u00A0\u00A0";  // TODO
                        break;

                    case "drawing":
                        let d = this.parseDrawing(c);

                        if(d)
                            result.children = [d];
                        break;

                    case "rPr":
                        this.parseRunProperties(c, result);
                        break;
                }
            });

            return result;
        }

        parseRunProperties(node: Node, run: IDomRun) {
            this.parseDefaultProperties(node, run.style = {}, null, c => {
                switch (c.localName) {
                    case "rStyle":
                        run.className = xml.className(c, "val");
                        break;

                    case "vertAlign":
                        switch(xml.stringAttr(c, "val"))
                        {
                            case "subscript": run.wrapper = "sub"; break;
                            case "superscript": run.wrapper = "sup"; break;
                        }
                        break;

                    default:
                        return false;
                }

                return true;
            });
        }

        parseDrawing(node: Node): IDomElement {
            for(var n of xml.nodes(node)) {
                switch (n.localName){
                    case "inline": 
                    case "anchor": 
                        return this.parseDrawingWrapper(n);
                }
            }
        }

        parseDrawingWrapper(node: Node): IDomDocument {
            var result = <IDomElement>{ domType: DomType.Drawing, children: [], style: {} };
            var isAnchor = node.localName == "anchor";

            //TODO
            // result.style["left"] = xml.sizeAttr(node, "distL", SizeType.Emu);
            // result.style["top"] = xml.sizeAttr(node, "distT", SizeType.Emu);
            // result.style["right"] = xml.sizeAttr(node, "distR", SizeType.Emu);
            // result.style["bottom"] = xml.sizeAttr(node, "distB", SizeType.Emu);
            
            for(var n of xml.nodes(node)) {
                switch (n.localName){
                    case "extent":
                        result.style["width"] = xml.sizeAttr(n, "cx", SizeType.Emu);
                        result.style["height"] = xml.sizeAttr(n, "cy", SizeType.Emu);
                        break;

                    case "positionH":
                        break;

                    case "positionV":
                        break;

                    case "graphic": 
                        var g = this.parseGraphic(n);

                        if(g)
                            result.children.push(g);
                        break;
                }
            }

            return result;
        }

        parseGraphic(node: Node): IDomElement {
            var graphicData = xml.byTagName(node, "graphicData");

            for(let n of xml.nodes(graphicData)) {
                switch(n.localName){
                    case "pic": 
                        return this.parsePicture(n);
                }
            }

            return null;
        }

        parsePicture(node: Node): IDomImage {
            var result = <IDomImage>{ domType : DomType.Image, src: "", style: {} };
            var blipFill = xml.byTagName(node, "blipFill");
            var blip = xml.byTagName(blipFill, "blip");

            result.src = xml.stringAttr(blip, "embed");

            var spPr = xml.byTagName(node, "spPr");
            var xfrm = xml.byTagName(spPr, "xfrm");

            for(var n of xml.nodes(xfrm)) {
                switch (n.localName){
                    case "ext":
                        result.style["width"] = xml.sizeAttr(n, "cx", SizeType.Emu);
                        result.style["height"] = xml.sizeAttr(n, "cy", SizeType.Emu);
                        break;

                    case "off":
                        result.style["left"] = xml.sizeAttr(n, "x", SizeType.Emu);
                        result.style["top"] = xml.sizeAttr(n, "y", SizeType.Emu);
                        break;
                }
            }

            return result;
        }

        parseTable(node: Node): IDomTable {
            var result: IDomTable = { domType: DomType.Table, children: [] };

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "tr":
                        result.children.push(this.parseTableRow(c));
                        break;

	                case "tblGrid":
                        result.columns = this.parseTableColumns(c);
                        break;

                    case "tblPr":
                        this.parseTableProperties(c, result);
                        break;
                }
            });

            return result;
        }
        
        parseTableColumns(node: Node): IDomTableColumn[] {
            var result = [];
            
            xml.foreach(node, n => {
                switch (n.localName) {
                    case "gridCol":
                        result.push({ width: xml.sizeAttr(n, "w") });
                        break;
                }
            });

            return result;
        }

        parseTableProperties(node: Node, table: IDomTable) {
            table.style = {};
            table.cellStyle = {};

            this.parseDefaultProperties(node, table.style, table.cellStyle, c => {
                switch (c.localName) {
                    case "tblStyle":
                        table.className = xml.className(c, "val");
                        break;

                    default:
                        return false;
                }

                return true;
            });

            switch(table.style["text-align"]) {
                case "center": 
                    delete table.style["text-align"];
                    table.style["margin-left"] = "auto";
                    table.style["margin-right"] = "auto";
                    break;

                case "right": 
                    delete table.style["text-align"];
                    table.style["margin-left"] = "auto";
                    break;
            }
        }

        parseTableRow(node: Node): IDomTableRow {
            var result: IDomTableRow = { domType: DomType.Row, children: [] };

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "tc":
                        result.children.push(this.parseTableCell(c));
                        break;

                    case "trPr":
                        this.parseTableRowProperties(c, result);
                        break;
                }
            });

            return result;
        }

        parseTableRowProperties(node: Node, row: IDomTableRow) {
            row.style = this.parseDefaultProperties(node, {}, null, c => {
                switch (c.localName) {
                    case "cnfStyle":
                        row.className = values.classNameOfCnfStyle(c);
                        break;

                    default:
                        return false;
                }

                return true;
            });
        }

        parseTableCell(node: Node): IDomElement {
            var result: IDomTableCell = { domType: DomType.Cell, children: [] };

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "tbl":
                        result.children.push(this.parseTable(c));
                        break;

                    case "p":
                        result.children.push(this.parseParagraph(c));
                        break;

                    case "tcPr":
                        this.parseTableCellProperties(c, result);
                        break;
                }
            });

            return result;
        }

        parseTableCellProperties(node: Node, cell: IDomTableCell) {
            cell.style = this.parseDefaultProperties(node, {}, null, c => {
                switch (c.localName) {
                    case "gridSpan":
                        cell.span = xml.intAttr(c, "val", null);
                        break;
                    
                    case "vMerge": //TODO
                        break;

                    case "cnfStyle":
                        cell.className = values.classNameOfCnfStyle(c);
                        break;

                    default:
                        return false;
                }

                return true;
            });
        }

        parseDefaultProperties(node: Node, style: IDomStyleValues = null, childStyle: IDomStyleValues = null, handler: (prop: Node) => void = null): IDomStyleValues {
            style = style || {};

            xml.foreach(node, c => {
                switch (c.localName) {
                    case "jc":
                        style["text-align"] = values.valueOfJc(c);
                        break;

                    case "textAlignment":
                        style["vertical-align"] = values.valueOfTextAlignment(c);
                        break;

                    case "color":
                        style["color"] = xml.colorAttr(c, "val", null, autos.color);
                        break;
                    
                    case "sz":
                        style["font-size"] = xml.sizeAttr(c, "val", SizeType.FontSize);
                        break;

                    case "shd":
                        style["background-color"] = xml.colorAttr(c, "fill", null, autos.shd);
                        break;

                    case "highlight":
                        style["background-color"] = xml.colorAttr(c, "val", null, autos.highlight);
                        break;

	                case "tcW": 
                        if(this.ignoreWidth)
                        break;

	                case "tblW":
                        style["width"] = values.valueOfSize(c, "w");
                        break;

                    case "trHeight":
                        this.parseTrHeight(c, style);
                        break;

                    case "strike":
                        style["text-decoration"] = values.valueOfStrike(c);
                        break;

                    case "b":
                        style["font-weight"] = values.valueOfBold(c);
                        break;

                    case "i":
                        style["font-style"] = "italic";
                        break;

                    case "u":
                        this.parseUnderline(c, style);
                        break;

                    case "ind":
                        this.parseIndentation(c, style);
                        break;

                    case "rFonts":
                        this.parseFont(c, style);
                        break;

                    case "tblBorders":
                        this.parseBorderProperties(c, childStyle || style);
                        break;

                    case "tblCellSpacing":
                        style["border-spacing"] = values.valueOfMargin(c);
                        style["border-collapse"] = "separate";
                        break;

                    case "pBdr":
                        this.parseBorderProperties(c, style);
                        break;

                    case "tcBorders":
                        this.parseBorderProperties(c, style);
                        break;

                    case "noWrap":
                        //TODO
                        //style["white-space"] = "nowrap";
                        break;

                    case "tblCellMar":
                    case "tcMar":
                        this.parseMarginProperties(c, childStyle || style);
                        break;

                    case "tblLayout":
                        style["table-layout"] = values.valueOfTblLayout(c);
                        break;

                    case "vAlign":
                        style["vertical-align"] = xml.stringAttr(c, "val");
                        break;

                    case "spacing":
                        this.parseSpacing(c, style);
                        break;

                    case "lang":
                    case "noProof":
                    case "webHidden": // maybe web-hidden should be implemented
                        //TODO ignore
                        break;

                    default:
                        if (handler != null && !handler(c))
                            this.debug && console.warn(`DOCX: Unknown document element: ${c.localName}`);
                        break;
                }
            });

            return style;
        }

        parseUnderline(node: Node, style: IDomStyleValues) {
            var val = xml.stringAttr(node, "val");

            if(val == null || val == "none")
                return;

            switch(val){
                case "dash": 
                case "dashDotDotHeavy":
                case "dashDotHeavy":
                case "dashedHeavy":
                case "dashLong": 
                case "dashLongHeavy":
                case "dotDash":
                case "dotDotDash": 
                    style["text-decoration-style"] = "dashed";
                    break;

                case "dotted":
                case "dottedHeavy": 
                    style["text-decoration-style"] = "dotted";
                    break;

                case "double":
                    style["text-decoration-style"] = "double";
                    break;

                case "single":
                case "thick":
                    style["text-decoration"] = "underline";
                    break;

                case "wave": 
                case "wavyDouble":
                case "wavyHeavy":
                    style["text-decoration-style"] = "wavy";
                    break;

                case "words":
                    style["text-decoration"] = "underline";
                    break;
            }

            var col = xml.colorAttr(node, "color");
            
            if(col)
                style["text-decoration-color"] = col;
        }

        parseFont(node: Node, style: IDomStyleValues) {
            var ascii = xml.stringAttr(node, "ascii");

            if(ascii)
                style["font-family"] = ascii;
        }

        parseIndentation(node: Node, style: IDomStyleValues){
            var firstLine = xml.sizeAttr(node, "firstLine"); 
            var left = xml.sizeAttr(node, "left");
            var start = xml.sizeAttr(node, "start");
            var right = xml.sizeAttr(node, "right");
            var end = xml.sizeAttr(node, "end");

            if(firstLine) style["text-indent"] = firstLine;
            if(left || start) style["margin-left"] = left || start;
            if(right || end) style["margin-right"] = right || end;
        }

        parseSpacing(node: Node, style: IDomStyleValues) {
            var before = xml.sizeAttr(node, "before");
            var after = xml.sizeAttr(node, "after");
            var line = xml.sizeAttr(node, "line");

            if(before) style["margin-top"] = before;
            if(after) style["margin-bottom"] = after;
            if(line){ 
                style["line-height"] = line;
                style["min-height"] = line;
            }
        }

	    parseTabs(node: Node, paragraph: IDomParagraph) {
            paragraph.tabs = xml.nodes(node, "tab").map(n => <DocxTab>{
                position: xml.sizeAttr(n, "pos"),
                leader: xml.stringAttr(n, "leader"),
                style: xml.stringAttr(n, "val"),
            });
        }

        parseMarginProperties(node: Node, output: IDomStyleValues) {
            xml.foreach(node, c => {
                switch (c.localName) {
                    case "left":
                        output["padding-left"] = values.valueOfMargin(c);
                        break;

                    case "right":
                        output["padding-right"] = values.valueOfMargin(c);
                        break;

                    case "top":
                        output["padding-top"] = values.valueOfMargin(c);
                        break;

                    case "bottom":
                        output["padding-bottom"] = values.valueOfMargin(c);
                        break;
                }
            });
        }

        parseTrHeight(node: Node, output: IDomStyleValues) {
            switch(xml.stringAttr(node, "hRule")) {
                case "exact" : 
                    output["height"] = xml.sizeAttr(node, "val"); 
                    break;

                case "atLeast" : 
                default :
                    output["height"] = xml.sizeAttr(node, "val"); 
                    // min-height doesn't work for tr
                    //output["min-height"] = xml.sizeAttr(node, "val");  
                    break;
            }
        }

        parseBorderProperties(node: Node, output: IDomStyleValues) {
            xml.foreach(node, c => {
                switch (c.localName) {
                    case "start":
                    case "left":
                        output["border-left"] = values.valueOfBorder(c);
                        break;

                    case "end":
                    case "right":
                        output["border-right"] = values.valueOfBorder(c);
                        break;

                    case "top":
                        output["border-top"] = values.valueOfBorder(c);
                        break;

                    case "bottom":
                        output["border-bottom"] = values.valueOfBorder(c);
                        break;
                }
            });
        }
    }

    enum SizeType {
        FontSize,
        Dxa,
        Emu,
        Border,
        Percent
    }

    class xml {
        static parse(xmlString, skipDeclaration = true) {
            if (skipDeclaration)
                xmlString = xmlString.replace(/<[?].*[?]>/, "");

            return new DOMParser().parseFromString(xmlString, "application/xml").firstChild;
        }

        static nodes(node: Node, tagName: string = null) {
            var result = [];
            
            for (var i = 0; i < node.childNodes.length; i++)
            {
                let n = node.childNodes[i];
                if(tagName == null || n.localName == tagName)
                    result.push(n);
            }

            return result;
        }

        static foreach(node: Node, cb: (n: Node) => void) {
            for (var i = 0; i < node.childNodes.length; i++)
                cb(node.childNodes[i]);
        }

        static byTagName(node: Node, tagName: string) {
            for (var i = 0; i < node.childNodes.length; i++)
                if (node.childNodes[i].localName == tagName)
                    return node.childNodes[i];
        }

        static nodeStringAttr(node: Node, nodeName, attrName: string) {
            var n = xml.byTagName(node, nodeName)
            return n ? xml.stringAttr(n, attrName) : null;
        }

        static stringAttr(node: Node, attrName: string) {
            var attrs = (<Element>node).attributes;

            for (var i = 0; attrs && i < attrs.length; i++) {
                var attr = attrs.item(i);

                if (attr.localName == attrName)
                    return attr.value;
            }

            return null;
        }

        static colorAttr(node: Node, attrName: string, defValue: string = null, autoColor: string = 'black') {
            var v = xml.stringAttr(node, attrName);
            
            switch (v)
            {
                case "yellow":
                     return v;

                case "auto":
                     return autoColor;
            }

            return v ? `#${v}` : defValue;
        }

        static boolAttr(node: Node, attrName: string, defValue: boolean = false) {
            var v = xml.stringAttr(node, attrName);

            switch (v)
            {
                case "1": return true;
                case "0": return false;
            }

            return defValue;
        }

        static intAttr(node: Node, attrName: string, defValue: number = 0) {
            var val = xml.stringAttr(node, attrName);
            return val ? parseInt(xml.stringAttr(node, attrName)) : 0;
        }

        static sizeAttr(node: Node, attrName: string, type: SizeType = SizeType.Dxa) {
            var val = xml.stringAttr(node, attrName);

            if (val == null || val.indexOf("pt") > -1)
                return val;

            var intVal = parseInt(val);

            switch (type) {
                case SizeType.Dxa: return (0.05 * intVal).toFixed(2) + "pt";
                case SizeType.Emu: return (intVal / 12700).toFixed(2) + "pt";
                case SizeType.FontSize: return (0.5 * intVal).toFixed(2) + "pt";
                case SizeType.Border: return (0.125 * intVal).toFixed(2) + "pt";
                case SizeType.Percent: return (0.02 * intVal).toFixed(2) + "%";
            }

            return val;
        }

        static className(node: Node, attrName: string) {
            var val = xml.stringAttr(node, attrName);

            return val && val.replace(/[ .]+/g, '-').replace(/[&]+/g, 'and');
        }
    }

    class values {
        static valueOfBold(c: Node) {
            return xml.boolAttr(c, "val", true) ? "bold" : "normal"
        }

        static valueOfSize(c: Node, attr: string) {
            var type: SizeType = SizeType.Dxa;

            switch(xml.stringAttr(c, "type")) {
                case "dxa": break;
                case "pct": type = SizeType.Percent; break;
            }

            return xml.sizeAttr(c, attr, type);
        }

        static valueOfStrike(c: Node) {
            return xml.boolAttr(c, "val", true) ? "line-through" : "none"
        }

        static valueOfMargin(c: Node) {
            return xml.sizeAttr(c, "w");
        }

        static valueOfRelType(c: Node) {
            switch(xml.sizeAttr(c, "Type")) {
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings": 
                    return DomRelationshipType.Settings;
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme":
                    return DomRelationshipType.Theme;
                case "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects": 
                    return DomRelationshipType.StylesWithEffects;
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles":
                    return DomRelationshipType.Styles;
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable": 
                    return DomRelationshipType.FontTable;
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image": 
                    return DomRelationshipType.Image;
                case "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings": 
                    return DomRelationshipType.WebSettings;
            }

            return DomRelationshipType.Unknown;
        }

        static valueOfBorder(c: Node) {
            var type = xml.stringAttr(c, "val");

            if (type == "nil")
                return "none";

            var color = xml.colorAttr(c, "color");
            var size = xml.sizeAttr(c, "sz", SizeType.Border);

            return `${size} solid ${color == "auto" ? "black" : color}`;
        }

        static valueOfTblLayout(c: Node) {
            var type = xml.stringAttr(c, "val");
            return type == "fixed" ? "fixed" : "auto";
        }

        static classNameOfCnfStyle(c: Node){
            let className = "";
            let val = xml.stringAttr(c, "val");
            //FirstRow, LastRow, FirstColumn, LastColumn, Band1Vertical, Band2Vertical, Band1Horizontal, Band2Horizontal, NE Cell, NW Cell, SE Cell, SW Cell.

            if(val[0] == "1") className += " first-row";
            if(val[1] == "1") className += " last-row";
            if(val[2] == "1") className += " first-col";
            if(val[3] == "1") className += " last-col";
            if(val[4] == "1") className += " odd-col";
            if(val[5] == "1") className += " even-col";
            if(val[6] == "1") className += " odd-row";
            if(val[7] == "1") className += " even-row";
            if(val[8] == "1") className += " ne-cell";
            if(val[9] == "1") className += " nw-cell";
            if(val[10] == "1") className += " se-cell";
            if(val[11] == "1") className += " sw-cell";
            
            return className.trim();
        }

        static valueOfJc(c: Node) {
            var type = xml.stringAttr(c, "val");

            switch(type){
                case "start": 
                case "left": return "left";
                case "center": return "center";
                case "end": 
                case "right": return "right";
                case "both": return "justify";
            }

            return type;
        }

        static valueOfTextAlignment(c: Node) {
            var type = xml.stringAttr(c, "val");

            switch(type){
                case "auto":
                case "baseline": return "baseline";
                case "top": return "top";
                case "center": return "middle";
                case "bottom": return "bottom";
            }

            return type;
        }

        static addSize(a: string, b: string): string {
            if(a == null) return b;
            if(b == null) return a;

            return `calc(${a} + ${b})`; //TODO
        }

        static checkMask(num, mask) {
            return (num & mask) == mask;
        }

        static classNameOftblLook(c: Node) {
            let val = xml.stringAttr(c, "val");
            let num = parseInt(val, 16);
            let className = "";
            //FirstRow, LastRow, FirstColumn, LastColumn, Band1Vertical, Band2Vertical, Band1Horizontal, Band2Horizontal, NE Cell, NW Cell, SE Cell, SW Cell.

            if(values.checkMask(num, 0x0020)) className += " first-row";
            if(values.checkMask(num, 0x0040)) className += " last-row";
            if(values.checkMask(num, 0x0080)) className += " first-col";
            if(values.checkMask(num, 0x0100)) className += " last-col";

            if(!values.checkMask(num, 0x0200)) className += " odd-row even-row";
            if(!values.checkMask(num, 0x0400)) className += " odd-col even-col";
            
            return className.trim();        
        }
    }
}
