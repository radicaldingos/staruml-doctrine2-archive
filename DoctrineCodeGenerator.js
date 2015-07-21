/*
 * Copyright (c) 2014 MKLab. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true */
/*global define, $, _, window, staruml, type, document, php7 */

define(function(require, exports, module) {
    "use strict";

    var Repository = app.getModule("core/Repository"),
        ProjectManager = app.getModule("engine/ProjectManager"),
        Engine = app.getModule("engine/Engine"),
        FileSystem = app.getModule("filesystem/FileSystem"),
        FileUtils = app.getModule("file/FileUtils"),
        Async = app.getModule("utils/Async"),
        UML = app.getModule("uml/UML");

    var CodeGenUtils = require("CodeGenUtils");

    // constant for separate namespace on code
    var NAMESPACE_SEPARATOR = "\\";

    /**
     * Doctrine Code Generator
     * @constructor
     *
     * @param {type.UMLPackage} baseModel
     * @param {string} basePath generated files and directories to be placed
     */
    function DoctrineCodeGenerator(baseModel, basePath) {

        /** @member {type.Model} */
        this.baseModel = baseModel;

        /** @member {string} */
        this.basePath = basePath;
    }

    /**
     * Return Indent String based on options
     * @param {Object} options
     * @return {string}
     */
    DoctrineCodeGenerator.prototype.getIndentString = function(options) {
        if (options.useTab) {
            return "\t";
        } else {
            var i, len, indent = [];
            for (i = 0, len = options.indentSpaces; i < len; i++) {
                indent.push(" ");
            }
            return indent.join("");
        }
    };

    /**
     * Generate codes from a given element
     * @param {type.Model} elem
     * @param {string} path
     * @param {Object} options
     * @return {$.Promise}
     */
    DoctrineCodeGenerator.prototype.generate = function(elem, path, options) {
        var result = new $.Deferred(),
            self = this,
            fullPath,
            directory,
            codeWriter,
            file;

        // Package
        if (elem instanceof type.UMLPackage) {
            fullPath = path + "/" + elem.name;
            directory = FileSystem.getDirectoryForPath(fullPath);
            directory.create(function(err, stat) {
                if (!err) {
                    Async.doSequentially(
                        elem.ownedElements,
                        function(child) {
                            return self.generate(child, fullPath, options);
                        },
                        false
                        ).then(result.resolve, result.reject);
                } else {
                    result.reject(err);
                }
            });
        } else if (elem instanceof type.UMLClass) {

            // AnnotationType
            if (elem.stereotype === "annotationType") {
                fullPath = path + "/" + elem.name + ".php";
                codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
                codeWriter.writeLine("<?php\n");
                this.writeNamespaceDeclaration(codeWriter, elem, options);
                codeWriter.writeLine();
                this.writeAnnotationType(codeWriter, elem, options);
                file = FileSystem.getFileForPath(fullPath);
                FileUtils.writeText(file, codeWriter.getData(), true).then(result.resolve, result.reject);

                // Class
            } else {
                fullPath = path + "/" + elem.name + options.classExtension + ".php";
                codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
                codeWriter.writeLine("<?php\n");
                this.writeNamespaceDeclaration(codeWriter, elem, options);
                this.writeUsesDeclaration(codeWriter, elem, options);
                this.writeClass(codeWriter, elem, options);
                file = FileSystem.getFileForPath(fullPath);
                FileUtils.writeText(file, codeWriter.getData(), true).then(result.resolve, result.reject);
            }

            // Interface
        } else if (elem instanceof type.UMLInterface) {
            fullPath = path + "/" + elem.name + options.interfaceExtension + ".php";
            codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
            codeWriter.writeLine("<?php\n");
            this.writeNamespaceDeclaration(codeWriter, elem, options);
            codeWriter.writeLine();
            this.writeInterface(codeWriter, elem, options);
            file = FileSystem.getFileForPath(fullPath);
            FileUtils.writeText(file, codeWriter.getData(), true).then(result.resolve, result.reject);

            // Enum
        } else if (elem instanceof type.UMLEnumeration) {
            fullPath = path + "/" + elem.name + ".php";
            codeWriter = new CodeGenUtils.CodeWriter(this.getIndentString(options));
            codeWriter.writeLine("<?php\n");
            this.writeNamespaceDeclaration(codeWriter, elem, options);
            codeWriter.writeLine();
            this.writeEnum(codeWriter, elem, options);
            file = FileSystem.getFileForPath(fullPath);
            FileUtils.writeText(file, codeWriter.getData(), true).then(result.resolve, result.reject);

            // Others (Nothing generated.)
        } else {
            result.resolve();
        }
        return result.promise();
    };


    /**
     * Return visibility
     * @param {type.Model} elem
     * @return {string}
     */
    DoctrineCodeGenerator.prototype.getVisibility = function(elem) {
        switch (elem.visibility) {
            case UML.VK_PUBLIC:
                return "public";
            case UML.VK_PROTECTED:
                return "protected";
            case UML.VK_PRIVATE:
                return "private";
        }
        return null;
    };

    /**
     * Collect modifiers of a given element.
     * @param {type.Model} elem
     * @return {Array.<string>}
     */
    DoctrineCodeGenerator.prototype.getModifiersClass = function(elem) {
        var modifiers = [];

        if (elem.isStatic === true) {
            modifiers.push("static");
        }
        if (elem.isAbstract === true) {
            modifiers.push("abstract");
        }
        if (elem.isFinalSpecification === true || elem.isLeaf === true) {
            modifiers.push("final");
        }
        if (elem.concurrency === UML.CCK_CONCURRENT) {
            modifiers.push("synchronized");
        }
        // transient
        // volatile
        // strictfp
        // const
        // native
        return modifiers;
    };
    /**
     * Collect modifiers of a given element.
     * @param {type.Model} elem
     * @return {Array.<string>}
     */
    DoctrineCodeGenerator.prototype.getModifiers = function(elem) {
        var modifiers = [];
        var visibility = this.getVisibility(elem);
        if (visibility) {
            modifiers.push(visibility);
        }
        var status = this.getModifiersClass(elem);
        return _.union(modifiers, status);
    };

    /**
     * Collect super classes of a given element
     * @param {type.Model} elem
     * @return {Array.<type.Model>}
     */
    DoctrineCodeGenerator.prototype.getSuperClasses = function(elem) {
        var generalizations = Repository.getRelationshipsOf(elem, function(rel) {
            return (rel instanceof type.UMLGeneralization && rel.source === elem);
        });
        return _.map(generalizations, function(gen) {
            return gen.target;
        });
    };

    /**
     * Collect super interfaces of a given element
     * @param {type.Model} elem
     * @return {Array.<type.Model>}
     */
    DoctrineCodeGenerator.prototype.getSuperInterfaces = function(elem) {
        var realizations = Repository.getRelationshipsOf(elem, function(rel) {
            return (rel instanceof type.UMLInterfaceRealization && rel.source === elem);
        });
        return _.map(realizations, function(gen) {
            return gen.target;
        });
    };

    /**
     * 
     * @param {type.Model} elem
     * @return {Array}
     */
    DoctrineCodeGenerator.prototype.getNamespaces = function(elem) {
        var _namespace = [];
        var _parent = [];
        if (elem._parent instanceof type.UMLPackage && !(elem._parent instanceof type.UMLModel)) {
            _namespace.push(elem._parent.name);
            _parent = this.getNamespaces(elem._parent);
        }

        return _.union(_parent, _namespace);
    };

    /**
     * Return type expression
     * @param {type.Model} elem
     * @return {string}
     */
    DoctrineCodeGenerator.prototype.getType = function(elem) {
        var _type = "void";
        var _namespace = "";
        // type name
        if (elem instanceof type.UMLAssociationEnd) {
            if (elem.reference instanceof type.UMLModelElement && elem.reference.name.length > 0) {
                _type = elem.reference.name;
                _namespace = _.map(this.getNamespaces(elem.reference), function(e) {
                    return e;
                }).join(NAMESPACE_SEPARATOR);
                _type = NAMESPACE_SEPARATOR + _namespace + NAMESPACE_SEPARATOR + _type;
            }
        } else {
            if (elem.type instanceof type.UMLModelElement && elem.type.name.length > 0) {
                _type = elem.type.name;
                _namespace = _.map(this.getNamespaces(elem.type), function(e) {
                    return e;
                }).join(NAMESPACE_SEPARATOR);
                _type = NAMESPACE_SEPARATOR + _namespace + NAMESPACE_SEPARATOR + _type;
            } else if (_.isString(elem.type) && elem.type.length > 0) {
                _type = elem.type;
            }
        }
        // multiplicity
        if (elem.multiplicity && _type !== "void") {
            if (_.contains(["0..*", "1..*", "*"], elem.multiplicity.trim())) {
                _type += "[]";
            }
        }
        return _type;
    };

    /**
     * Write Doc
     * @param {StringWriter} codeWriter
     * @param {string} text
     * @param {Object} options
     */
    DoctrineCodeGenerator.prototype.writeDoc = function(codeWriter, text, options) {
        var i, len, lines;
        if (options.phpDoc && _.isString(text)) {
            lines = text.trim().split("\n");
            codeWriter.writeLine("/**");
            for (i = 0, len = lines.length; i < len; i++) {
                codeWriter.writeLine(" * " + lines[i]);
            }
            codeWriter.writeLine(" */");
        }
    };

    /**
     * Write Spacification
     * @param {StringWriter} codeWriter
     * @param {string} text
     */
    DoctrineCodeGenerator.prototype.writeSpac = function(codeWriter, text) {
        var i, len, lines;
        if (_.isString(text)) {
            lines = text.trim().split("\n");
            for (i = 0, len = lines.length; i < len; i++) {
                codeWriter.writeLine(lines[i]);
            }
        }
    };
    
    DoctrineCodeGenerator.prototype.getNamespace = function(elem) {
        var path = null;
        if (elem._parent) {
            path = _.map(elem._parent.getPath(this.baseModel), function(e) {
                return e.name;
            }).join(NAMESPACE_SEPARATOR);
        }
        return path;
    };

    /**
     * Write Package Declaration
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeNamespaceDeclaration = function(codeWriter, elem, options) {
        var path = this.getNamespaces(elem);
        if (path) {
            codeWriter.writeLine("namespace " + path + ";\n");
        }
    };
    
    DoctrineCodeGenerator.prototype.writeUsesDeclaration = function(codeWriter, elem, options) {
        codeWriter.writeLine("use Doctrine\\ORM\\Mapping as ORM;\n");
    },

    /**
     * Write Constructor
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeConstructor = function(codeWriter, elem, options) {
        var haveConstruct = false;
        for (var i = 0, len = elem.operations.length; i < len; i++) {
            if (elem.operations[i].name === "__construct")
            {
                haveConstruct = true;
            }
            ;
        }
        var _extends = this.getSuperClasses(elem);

        if (elem.name.length > 0 && _extends.length <= 0)
        {
            if (!haveConstruct)
            {
                var terms = [];
                // Doc
                this.writeDoc(codeWriter, elem.documentation, options);
                // Visibility
                var visibility = this.getVisibility(elem);
                if (visibility) {
                    terms.push(visibility);
                }
                terms.push("function __construct()");
                codeWriter.writeLine(terms.join(" ") + " {");
                codeWriter.writeLine("}");
            }
        }
    };

    /**
     * Write Member Variable
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeMemberVariable = function(codeWriter, elem, options) {
        if (elem.name.length > 0) {
            var terms = [];
            
            // PHPDoc + Annotations
            var doc = "@var " + this.getType(elem) + " " + elem.documentation.trim();
            if (true) {
                terms.push("name=\"" + elem.name + "\"");
                terms.push("type=\"" + elem.type + "\"");
                if (elem.type == "string") {
                    terms.push("length=255");
                }
                if (elem.isUnique) {
                    terms.push("unique=\"true\"");
                }
                doc += "\n\n@ORM\\Column(" + terms.join(", ") + ")";
                
                if (elem.isId) {
                    doc += "\n@ORM\\Id";
                    doc += "\n@ORM\\GeneratedValue(strategy=\"AUTO\")";
                }
            }
            this.writeDoc(codeWriter, doc, options);

            // modifiers const
            var terms = [];
            if (elem.isFinalSpecification === true || elem.isLeaf === true) {
                terms.push("const " + elem.name.toUpperCase());
            }
            else
            {
                // modifiers
                var _modifiers = this.getModifiers(elem);
                if (_modifiers.length > 0) {
                    terms.push(_modifiers.join(" "));
                }
                // name
                terms.push("$" + elem.name);
            }
            // initial value
            if (elem.defaultValue && elem.defaultValue.length > 0) {
                terms.push("= " + elem.defaultValue);
            }
            codeWriter.writeLine(terms.join(" ") + ";");
        }
    };
    
    DoctrineCodeGenerator.prototype.writeSettersAndGetters = function(codeWriter, elem, options) {
        if (elem.name.length > 0) {
            // SETTER
            var terms = [];
            
            // Documentation
            var doc =  "Set " + elem.name;
            if (elem.type) {
                doc += "\n\n\@param " + elem.type + " " + elem.name + " " + elem.documentation.trim();
            } else {
                doc += "\n\n\@param type " + elem.name + " " + elem.documentation.trim();
            }
            this.writeDoc(codeWriter, doc, options);

            terms.push("public function");

            // name
            terms.push("set" + elem.name.capitalize() + "($" + elem.name + ")");

            // body
            codeWriter.writeLine(terms.join(" "));
            codeWriter.writeLine("{");
            codeWriter.indent();

            codeWriter.writeLine("$this->" + elem.name + " = $" + elem.name + ";");

            codeWriter.outdent();
            codeWriter.writeLine("}");
            codeWriter.writeLine();
            
            // GETTER
            var terms = [];
            
            // Documentation
            var doc = "Get " + elem.name;
            if (elem.type) {
                doc += "\n\n@return " + elem.type + " " + elem.documentation.trim();
            } else {
                doc += "\n\n@return type " + elem.documentation.trim();
            }
            this.writeDoc(codeWriter, doc, options);

            terms.push("public function");

            // name
            terms.push("get" + elem.name.capitalize() + "()");

            // body
            codeWriter.writeLine(terms.join(" "));
            codeWriter.writeLine("{");
            codeWriter.indent();

            //spacification
            codeWriter.writeLine("return $this->" + elem.name + ";");

            codeWriter.outdent();
            codeWriter.writeLine("}");
            codeWriter.writeLine();
        }
    };

    /**
     * Write Method
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     * @param {boolean} skipBody
     * @param {boolean} skipParams
     */
    DoctrineCodeGenerator.prototype.writeMethod = function(codeWriter, elem, options, skipBody, skipParams) {
        if (elem.name.length > 0) {
            var terms = [];
            var params = elem.getNonReturnParameters();
            var returnParam = elem.getReturnParameter();
            var _that = this;
            // doc
            var doc = elem.documentation.trim();
            _.each(params, function(param) {
                doc += "\n@param " + _that.getType(param) + " $" + param.name + " " + param.documentation;
            });
            if (returnParam) {
                doc += "\n@return " + this.getType(returnParam) + " " + returnParam.documentation;
            }
            this.writeDoc(codeWriter, doc, options);

            // modifiers
            var _modifiers = this.getModifiers(elem);
            if (_modifiers.length > 0) {
                terms.push(_modifiers.join(" "));
            }

            terms.push("function");


            // name + parameters
            var paramTerms = [];
            if (!skipParams) {
                var i, len;
                for (i = 0, len = params.length; i < len; i++) {
                    var p = params[i];
                    var s = "$" + p.name;

                    paramTerms.push(s);
                }
            }
            terms.push(elem.name + "(" + paramTerms.join(", ") + ")");

            // body
            if (skipBody === true || _.contains(_modifiers, "abstract")) {
                codeWriter.writeLine(terms.join(" ") + ";");
            } else {
                codeWriter.writeLine(terms.join(" ") + " {");
                codeWriter.indent();

                //spacification
                if (elem.specification.length > 0) {
                    this.writeSpac(codeWriter, elem.specification);
                } else {
                    codeWriter.writeLine("// TODO implement here");

                    // return statement
                    if (returnParam) {
                        var returnType = this.getType(returnParam);
                        if (returnType === "boolean") {
                            codeWriter.writeLine("return false;");
                        } else if (returnType === "int" || returnType === "long" || returnType === "short" || returnType === "byte") {
                            codeWriter.writeLine("return 0;");
                        } else if (returnType === "float" || returnType === "double") {
                            codeWriter.writeLine("return 0.0;");
                        } else if (returnType === "char") {
                            codeWriter.writeLine("return '0';");
                        } else if (returnType === "string") {
                            codeWriter.writeLine('return "";');
                        } else {
                            codeWriter.writeLine("return null;");
                        }
                    }
                }

                codeWriter.outdent();
                codeWriter.writeLine("}");
            }
        }
    };


    /**
     * Write Method Abstract for SuperClass
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     * @param {boolean} skipParams
     */
    DoctrineCodeGenerator.prototype.writeMethodSuperClass = function(codeWriter, _method, elem, options, skipParams) {

        var haveMethodName = false;

        // Methods
        for (var a = 0, length = elem.operations.length; a < length; a++) {
            if (elem.operations[a].name === _method.name) {
                haveMethodName = true;
            }
        }

        if (_method.name.length > 0 && !haveMethodName) {
            var terms = [];
            var params = _method.getNonReturnParameters();
            var returnParam = _method.getReturnParameter();
            var _that = this;

            // doc
            var doc = _method.documentation.trim();
            _.each(params, function(param) {
                doc += "\n@param " + _that.getType(param) + " " + param.name + " " + param.documentation;
            });
            if (returnParam) {
                doc += "\n@return " + this.getType(returnParam) + " " + returnParam.documentation;
            }
            this.writeDoc(codeWriter, doc, options);

            // modifiers
            var modifiers = [];
            var visibility = this.getVisibility(_method);
            if (visibility) {
                modifiers.push(visibility);
                terms.push(modifiers.join(" "));
            }

            terms.push("function");

            // name + parameters
            var paramTerms = [];
            if (!skipParams) {
                var i, len;
                for (i = 0, len = params.length; i < len; i++) {
                    var p = params[i];
                    var s = "$" + p.name;

                    paramTerms.push(s);
                }
            }
            terms.push(_method.name + "(" + paramTerms.join(", ") + ")");

            // body
            codeWriter.writeLine(terms.join(" ") + " {");
            codeWriter.indent();

            codeWriter.writeLine("// TODO implement here");

            codeWriter.outdent();
            codeWriter.writeLine("}");
        }

    };

    /**
     * Write Class
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeClass = function(codeWriter, elem, options) {
        var i, len, terms = [];

        // PHPDoc + Annotations
        var doc = this.getNamespaces(elem) + NAMESPACE_SEPARATOR + elem.name;
        if (elem.documentation) {
            doc += "\n\n" + elem.documentation.trim();
        }
        if (ProjectManager.getProject().author && ProjectManager.getProject().author.length > 0) {
            doc += "\n@author " + ProjectManager.getProject().author;
        }
        if (true) {
            doc += "\n\n@ORM\\Entity\n@ORM\\Table(name=\"" + elem.name.toUnderscore() + "\")";
        }
        this.writeDoc(codeWriter, doc, options);

        // Class Modifiers
        var _modifiers = this.getModifiersClass(elem);
        if (_modifiers.length > 0) {
            terms.push(_modifiers.join(" "));
        }

        // Class
        terms.push("class");
        terms.push(elem.name);

        // Extends
        var _extends = this.getSuperClasses(elem);
        var _superClass;
        if (_extends.length > 0) {
            _superClass = _extends[0];
            terms.push("extends " + _superClass.name);
        }

        // Implements
        var _implements = this.getSuperInterfaces(elem);
        if (_implements.length > 0) {
            terms.push("implements " + _.map(_implements, function(e) {
                return e.name;
            }).join(", "));
        }
        codeWriter.writeLine(terms.join(" "));
        codeWriter.writeLine("{");
        codeWriter.indent();

        // Member Variables
        // (from attributes)
        for (i = 0, len = elem.attributes.length; i < len; i++) {
            this.writeMemberVariable(codeWriter, elem.attributes[i], options);
            codeWriter.writeLine();
        }
        // (from associations)
        var associations = Repository.getRelationshipsOf(elem, function(rel) {
            return (rel instanceof type.UMLAssociation);
        });
        for (i = 0, len = associations.length; i < len; i++) {
            var asso = associations[i];
            if (asso.end1.reference === elem && asso.end2.navigable === true) {
                this.writeMemberVariable(codeWriter, asso.end2, options);
                codeWriter.writeLine();
            } else if (asso.end2.reference === elem && asso.end1.navigable === true) {
                this.writeMemberVariable(codeWriter, asso.end1, options);
                codeWriter.writeLine();
            }
        }
        
        // Constructor
        //this.writeConstructor(codeWriter, elem, options);
        //codeWriter.writeLine();

        // Setters & Getters
        if (true) {
            for (i = 0, len = elem.attributes.length; i < len; i++) {
                this.writeSettersAndGetters(codeWriter, elem.attributes[i], options, false, false);
            }
        }

        // Methods
        for (i = 0, len = elem.operations.length; i < len; i++) {
            this.writeMethod(codeWriter, elem.operations[i], options, false, false);
            codeWriter.writeLine();
        }

        if (typeof _superClass !== "undefined") {
            // Methods
            for (var i = 0, len = _superClass.operations.length; i < len; i++) {
                var _method = _superClass.operations[i];
                if (typeof _method !== "undefined" && _method.isAbstract === true) {
                    this.writeMethodSuperClass(codeWriter, _method, elem, options, false);
                }
            }
        }
        // Inner Definitions
        for (i = 0, len = elem.ownedElements.length; i < len; i++) {
            var def = elem.ownedElements[i];
            if (def instanceof type.UMLClass) {
                if (def.stereotype === "annotationType") {
                    this.writeAnnotationType(codeWriter, def, options);
                } else {
                    this.writeClass(codeWriter, def, options);
                }
                codeWriter.writeLine();
            } else if (def instanceof type.UMLInterface) {
                this.writeInterface(codeWriter, def, options);
                codeWriter.writeLine();
            } else if (def instanceof type.UMLEnumeration) {
                this.writeEnum(codeWriter, def, options);
                codeWriter.writeLine();
            }
        }

        codeWriter.outdent();
        codeWriter.writeLine("}");
    };


    /**
     * Write Interface
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeInterface = function(codeWriter, elem, options) {
        var i, len, terms = [];

        // Doc
        this.writeDoc(codeWriter, elem.documentation, options);

        // Modifiers
        var visibility = this.getVisibility(elem);
        if (visibility) {
            terms.push(visibility);
        }

        // Interface
        terms.push("interface");
        terms.push(elem.name);

        // Extends
        var _extends = this.getSuperClasses(elem);
        if (_extends.length > 0) {
            terms.push("extends " + _.map(_extends, function(e) {
                return e.name;
            }).join(", "));
        }
        codeWriter.writeLine(terms.join(" ") + " {");
        codeWriter.writeLine();
        codeWriter.indent();

        // Member Variables
        // (from attributes)
        for (i = 0, len = elem.attributes.length; i < len; i++) {
            this.writeMemberVariable(codeWriter, elem.attributes[i], options);
            codeWriter.writeLine();
        }
        // (from associations)
        var associations = Repository.getRelationshipsOf(elem, function(rel) {
            return (rel instanceof type.UMLAssociation);
        });
        for (i = 0, len = associations.length; i < len; i++) {
            var asso = associations[i];
            if (asso.end1.reference === elem && asso.end2.navigable === true) {
                this.writeMemberVariable(codeWriter, asso.end2, options);
                codeWriter.writeLine();
            } else if (asso.end2.reference === elem && asso.end1.navigable === true) {
                this.writeMemberVariable(codeWriter, asso.end1, options);
                codeWriter.writeLine();
            }
        }

        // Methods
        for (i = 0, len = elem.operations.length; i < len; i++) {
            this.writeMethod(codeWriter, elem.operations[i], options, true, false);
            codeWriter.writeLine();
        }

        // Inner Definitions
        for (i = 0, len = elem.ownedElements.length; i < len; i++) {
            var def = elem.ownedElements[i];
            if (def instanceof type.UMLClass) {
                if (def.stereotype === "annotationType") {
                    this.writeAnnotationType(codeWriter, def, options);
                } else {
                    this.writeClass(codeWriter, def, options);
                }
                codeWriter.writeLine();
            } else if (def instanceof type.UMLEnumeration) {
                this.writeEnum(codeWriter, def, options);
                codeWriter.writeLine();
            }
        }

        codeWriter.outdent();
        codeWriter.writeLine("}");
    };

    /**
     * Write Enum
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeEnum = function(codeWriter, elem, options) {
        var i, len, terms = [];
        // Doc
        this.writeDoc(codeWriter, elem.documentation, options);

        // Modifiers
        var visibility = this.getVisibility(elem);
        if (visibility) {
            terms.push(visibility);
        }
        // Enum
        terms.push("enum");
        terms.push(elem.name);

        codeWriter.writeLine(terms.join(" ") + " {");
        codeWriter.indent();

        // Literals
        for (i = 0, len = elem.literals.length; i < len; i++) {
            codeWriter.writeLine(elem.literals[i].name + (i < elem.literals.length - 1 ? "," : ""));
        }

        codeWriter.outdent();
        codeWriter.writeLine("}");
    };


    /**
     * Write AnnotationType
     * @param {StringWriter} codeWriter
     * @param {type.Model} elem
     * @param {Object} options     
     */
    DoctrineCodeGenerator.prototype.writeAnnotationType = function(codeWriter, elem, options) {
        var i, len, terms = [];

        // Doc
        var doc = elem.documentation.trim();
        if (Repository.getProject().author && Repository.getProject().author.length > 0) {
            doc += "\n@author " + Repository.getProject().author;
        }
        this.writeDoc(codeWriter, doc, options);

        // Modifiers
        var _modifiers = this.getModifiersClass(elem);

        if (_modifiers.length > 0) {
            terms.push(_modifiers.join(" "));
        }

        // AnnotationType
        terms.push("@interface");
        terms.push(elem.name);

        codeWriter.writeLine(terms.join(" ") + " {");
        codeWriter.writeLine();
        codeWriter.indent();

        // Member Variables
        for (i = 0, len = elem.attributes.length; i < len; i++) {
            this.writeMemberVariable(codeWriter, elem.attributes[i], options);
            codeWriter.writeLine();
        }

        // Methods
        for (i = 0, len = elem.operations.length; i < len; i++) {
            this.writeMethod(codeWriter, elem.operations[i], options, true, true);
            codeWriter.writeLine();
        }

        // Inner Definitions
        for (i = 0, len = elem.ownedElements.length; i < len; i++) {
            var def = elem.ownedElements[i];
            if (def instanceof type.UMLClass) {
                if (def.stereotype === "annotationType") {
                    this.writeAnnotationType(codeWriter, def, options);
                } else {
                    this.writeClass(codeWriter, def, options);
                }
                codeWriter.writeLine();
            } else if (def instanceof type.UMLInterface) {
                this.writeInterface(codeWriter, def, options);
                codeWriter.writeLine();
            } else if (def instanceof type.UMLEnumeration) {
                this.writeEnum(codeWriter, def, options);
                codeWriter.writeLine();
            }
        }

        codeWriter.outdent();
        codeWriter.writeLine("}");
    };
    
    String.prototype.toUnderscore = function(){
        return this.charAt(0).toLowerCase() + this.slice(1).replace(/([A-Z])/g, function($1){return "_" + $1.toLowerCase();});
    };
    
    String.prototype.capitalize = function() {
        return this.charAt(0).toUpperCase() + this.slice(1);
    }

    /**
     * Generate
     * @param {type.Model} baseModel
     * @param {string} basePath
     * @param {Object} options
     */
    function generate(baseModel, basePath, options) {
        var result = new $.Deferred();
        var doctrineCodeGenerator = new DoctrineCodeGenerator(baseModel, basePath);
        return doctrineCodeGenerator.generate(baseModel, basePath, options);
    }

    exports.generate = generate;

});
