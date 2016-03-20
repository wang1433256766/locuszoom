/* global d3,LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  Singletons

  LocusZoom has various singleton objects that are used for registering functions or classes.
  These objects provide safe, standard methods to redefine or delete existing functions/classes
  as well as define new custom functions/classes to be used in a plot.

*/


/****************
  Label Functions

  These functions will generate a string based on a provided state object. Useful for dynamic axis labels.
*/

LocusZoom.LabelFunctions = (function() {
    var obj = {};
    var functions = {};

    obj.get = function(name, state) {
        if (!name) {
            return null;
        } else if (functions[name]) {
            if (typeof state == "undefined"){
                return functions[name];
            } else {
                return functions[name](state);
            }
        } else {
            throw("label function [" + name + "] not found");
        }
    };

    obj.set = function(name, fn) {
        if (fn) {
            functions[name] = fn;
        } else {
            delete functions[name];
        }
    };

    obj.add = function(name, fn) {
        if (functions.name) {
            throw("label function already exists with name: " + name);
        } else {
            obj.set(name, fn);
        }
    };

    obj.list = function() {
        return Object.keys(functions);
    };

    return obj;
})();

// Label function for "Chromosome # (Mb)" where # comes from state
LocusZoom.LabelFunctions.add("chromosome", function(state){
    if (!isNaN(+state.chr)){ 
        return "Chromosome " + state.chr + " (Mb)";
    } else {
        return "Chromosome (Mb)";
    }
});


/****************
  Scale Functions

  Singleton for accessing/storing functions that will convert arbitrary data points to values in a given scale
  Useful for anything that needs to scale discretely with data (e.g. color, point size, etc.)

  All scale functions must accept an object of parameters and a value to process.
*/

LocusZoom.ScaleFunctions = (function() {
    var obj = {};
    var functions = {};

    obj.get = function(name, parameters, value) {
        if (!name) {
            return null;
        } else if (functions[name]) {
            if (typeof parameters == "undefined" && typeof value == "undefined"){
                return functions[name];
            } else {
                return functions[name](parameters, value);
            }
        } else {
            throw("color function [" + name + "] not found");
        }
    };

    obj.set = function(name, fn) {
        if (fn) {
            functions[name] = fn;
        } else {
            delete functions[name];
        }
    };

    obj.add = function(name, fn) {
        if (functions.name) {
            throw("color function already exists with name: " + name);
        } else {
            obj.set(name, fn);
        }
    };

    obj.list = function() {
        return Object.keys(functions);
    };

    return obj;
})();

// Numerical Bin scale function: bin a dataset numerically by an array of breakpoints
LocusZoom.ScaleFunctions.add("numerical_bin", function(parameters, value){
    var breaks = parameters.breaks;
    var values = parameters.values;
    if (value == null || isNaN(+value)){
        return (parameters.null_value ? parameters.null_value : values[0]);
    }
    var threshold = breaks.reduce(function(prev, curr){
        if (+value < prev || (+value >= prev && +value < curr)){
            return prev;
        } else {
            return curr;
        }
    });
    return values[breaks.indexOf(threshold)];
});

// Categorical Bin scale function: bin a dataset numerically by matching against an array of distinct values
LocusZoom.ScaleFunctions.add("categorical_bin", function(parameters, value){
    if (parameters.categories.indexOf(value) != -1){
        return parameters.values[parameters.categories.indexOf(value)];
    } else {
        return (parameters.null_value ? parameters.null_value : parameters.values[0]); 
    }
});


/************************
  Data Layer Subclasses

  The abstract Data Layer class has general methods and properties that apply universally to all Data Layers
  Specific data layer subclasses (e.g. a scatter plot, a line plot, gene visualization, etc.) must be defined
  and registered with this singleton to be accessible.

  All new Data Layer subclasses must be defined by accepting an id string and a layout object.
  Singleton for storing available Data Layer classes as well as updating existing and/or registering new ones
*/

LocusZoom.DataLayers = (function() {
    var obj = {};
    var datalayers = {};

    obj.get = function(name, id, layout, state) {
        if (!name) {
            return null;
        } else if (datalayers[name]) {
            if (typeof id == "undefined" || typeof layout == "undefined"){
                throw("id or layout argument missing for data layer [" + name + "]");
            } else {
                state = LocusZoom.mergeLayouts(state || {}, LocusZoom.DataLayer.DefaultState);
                return new datalayers[name](id, layout, state);
            }
        } else {
            throw("data layer [" + name + "] not found");
        }
    };

    obj.set = function(name, datalayer) {
        if (datalayer) {
            if (typeof datalayer != "function"){
                throw("unable to set data layer [" + name + "], argument provided is not a function");
            } else {
                datalayers[name] = datalayer;
                datalayers[name].prototype = new LocusZoom.DataLayer();
            }
        } else {
            delete datalayers[name];
        }
    };

    obj.add = function(name, datalayer) {
        if (datalayers[name]) {
            throw("data layer already exists with name: " + name);
        } else {
            obj.set(name, datalayer);
        }
    };

    obj.list = function() {
        return Object.keys(datalayers);
    };

    return obj;
})();



/*********************
  Scatter Data Layer
  Implements a standard scatter plot
*/

LocusZoom.DataLayers.add("scatter", function(id, layout, state){

    LocusZoom.DataLayer.apply(this, arguments);

    this.DefaultState = {
        selected_id: null
    };

    this.DefaultLayout = {
        point_size: 40,
        point_shape: "circle",
        color: "#888888",
        y_axis: {
            axis: 1
        },
        selectable: true
    };

    this.layout = LocusZoom.mergeLayouts(layout, this.DefaultLayout);
    this.state = LocusZoom.mergeLayouts(state, this.DefaultState);

    // Reimplement the positionTooltip() method to be scatte-specific
    this.positionTooltip = function(d, id){
        if (typeof id != "string"){
            throw ("Unable to position tooltip: id is not a string");
        }
        var arrow_width = 7; // as defined in the default stylesheet
        var stroke_width = 1; // as defined in the default stylesheet
        var page_origin = this.getPageOrigin();
        var x_center = this.parent.x_scale(d[this.layout.x_axis.field]);
        var y_scale  = "y"+this.layout.y_axis.axis+"_scale";
        var y_center = this.parent[y_scale](d[this.layout.y_axis.field]);
        var tooltip_box = this.tooltips[id].node().getBoundingClientRect();
        // Position horizontally on the left or the right depending on which side of the plot the point is on
        var offset = Math.sqrt(this.layout.point_size / Math.PI);
        if (x_center <= this.parent.layout.width / 2){
            var left = page_origin.x + x_center + offset + arrow_width + stroke_width;
            var arrow_type = "arrow_left";
            var arrow_left = -1 * (arrow_width + stroke_width);
        } else {
            var left = page_origin.x + x_center - tooltip_box.width - offset - arrow_width - stroke_width;
            var arrow_type = "arrow_right";
            var arrow_left = tooltip_box.width - stroke_width;
        }
        // Position vertically centered unless we're at the top or bottom of the plot
        var data_layer_height = this.parent.layout.height - (this.parent.layout.margin.top + this.parent.layout.margin.bottom);
        if (y_center - (tooltip_box.height / 2) <= 0){
            var top = page_origin.y + y_center - (1.5 * arrow_width);
            var arrow_top = 0;
        } else if (y_center + (tooltip_box.height / 2) >= data_layer_height){
            var top = page_origin.y + y_center + arrow_width - tooltip_box.height;
            var arrow_top = tooltip_box.height - (2 * arrow_width);
        } else {
            var top = page_origin.y + y_center - (tooltip_box.height / 2);
            var arrow_top = (tooltip_box.height / 2) - arrow_width;
        }        
        // Apply positions to the main div
        this.tooltips[id].style("left", left + "px").style("top", top + "px");
        // Connect to click site with a left or right arrow
        this.tooltips[id].append("div")
            .style("position", "absolute")
            .attr("class", "lz-data_layer-tooltip-" + arrow_type)
            .style("left", arrow_left + "px")			 
				    .style("top", arrow_top + "px");
    };

    // Implement the main render function
    this.render = function(){
        this.svg.group.selectAll("*").remove(); // should this happen at all, or happen at the panel level?
        var selection = this.svg.group
            .selectAll("path.lz-data_layer-scatter")
            .data(this.data)
            .enter().append("path")
            .attr("id", function(d){ return 's' + d.id.replace(/\W/g,''); })
            .attr("class", "lz-data_layer-scatter")
            .attr("transform", function(d) {
                var x = this.parent.x_scale(d[this.layout.x_axis.field]);
                var y_scale = "y"+this.layout.y_axis.axis+"_scale";
                var y = this.parent[y_scale](d[this.layout.y_axis.field]);
                return "translate(" + x + "," + y + ")";
            }.bind(this))
            .attr("d", d3.svg.symbol().size(this.layout.point_size).type(this.layout.point_shape))
            .style({ cursor: "pointer" });
        // Apply id (if included in fields)
        if (this.layout.fields.indexOf("id") != -1){
            selection.attr("id", function(d){ return 's' + d.id.replace(/\W/g,''); });
        }
        // Apply color
        if (this.layout.color){
            switch (typeof this.layout.color){
            case "string":
                selection.attr("fill", this.layout.color);
                break;
            case "object":
                if (this.layout.color.scale_function && this.layout.color.field) {
                    selection.attr("fill", function(d){
                        return LocusZoom.ScaleFunctions.get(this.layout.color.scale_function,
                                                            this.layout.color.parameters || {},
                                                            d[this.layout.color.field]);
                    }.bind(this));
                }
                break;
            }
        }

        // Apply selectable, tooltip, etc
        if (this.layout.selectable && (this.layout.fields.indexOf("id") != -1)){
            selection.on("mouseover", function(d){
                var id = 's' + d.id.replace(/\W/g,'');
                if (this.state.selected_id != id){
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter-hovered");
                    if (this.layout.tooltip){ this.createTooltip(d, id); }
                }
            }.bind(this))
            .on("mouseout", function(d){
                var id = 's' + d.id.replace(/\W/g,'');
                if (this.state.selected_id != id){
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter");
                    if (this.layout.tooltip){ this.destroyTooltip(id); }
                }
            }.bind(this))
            .on("click", function(d){
                var id = 's' + d.id.replace(/\W/g,'');
                if (this.state.selected_id == id){
                    this.state.selected_id = null;
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter-hovered");
                } else {
                    if (this.state.selected_id != null){
                        d3.select("#" + this.state.selected_id).attr("class", "lz-data_layer-scatter");
                        if (this.layout.tooltip){ this.destroyTooltip(this.state.selected_id); }
                    }
                    this.state.selected_id = id;
                    d3.select("#" + id).attr("class", "lz-data_layer-scatter-selected");
                }
            }.bind(this));
            // Apply existing selection from state
            if (this.state.selected_id != null){
                d3.select("#" + this.state.selected_id).attr("class", "lz-data_layer-scatter-selected");
            }
        }
        
    };
       
    return this;
});

/*********************
  Genes Data Layer
  Implements a data layer that will render gene tracks
*/

LocusZoom.DataLayers.add("genes", function(id, layout, state){

    LocusZoom.DataLayer.apply(this, arguments);

    this.DefaultState = {
        selected_id: null
    };

    this.DefaultLayout = {
        label_font_size: 12,
        label_exon_spacing: 4,
        exon_height: 16,
        bounding_box_padding: 6,
        track_vertical_spacing: 10,
        selectable: true
    };

    this.layout = LocusZoom.mergeLayouts(layout, this.DefaultLayout);
    this.state = LocusZoom.mergeLayouts(state, this.DefaultState);
    
    // Helper function to sum layout values to derive total height for a single gene track
    this.getTrackHeight = function(){
        return 2 * this.layout.bounding_box_padding
            + this.layout.label_font_size
            + this.layout.label_exon_spacing
            + this.layout.exon_height
            + this.layout.track_vertical_spacing;
    }
    
    this.metadata.tracks = 1;
    this.metadata.gene_track_index = { 1: [] }; // track-number-indexed object with arrays of gene indexes in the dataset
    this.metadata.horizontal_padding = 4; // pixels to pad on either side of a gene or label when determining collisions

    // After we've loaded the genes interpret them to assign
    // each to a track so that they do not overlap in the view
    this.assignTracks = function(){

        // Function to get the width in pixels of a label given the text and layout attributes
        this.getLabelWidth = function(gene_name, font_size){
            var temp_text = this.svg.group.append("text")
                .attr("x", 0).attr("y", 0).attr("class", "lz-data_layer-gene lz-label")
                .style("font-size", font_size)
                .text(gene_name + "→");
            var label_width = temp_text.node().getBBox().width;
            temp_text.node().remove();
            return label_width;
        };

        // Reinitialize metadata
        this.metadata.tracks = 1;
        this.metadata.gene_track_index = { 1: [] };

        this.data.map(function(d, g){

            // Determine display range start and end, based on minimum allowable gene display width, bounded by what we can see
            // (range: values in terms of pixels on the screen)
            this.data[g].display_range = {
                start: this.parent.x_scale(Math.max(d.start, this.parent.parent.state.start)),
                end:   this.parent.x_scale(Math.min(d.end, this.parent.parent.state.end))
            };
            this.data[g].display_range.label_width = this.getLabelWidth(this.data[g].gene_name, this.layout.label_font_size);
            this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            // Determine label text anchor (default to middle)
            this.data[g].display_range.text_anchor = "middle";
            if (this.data[g].display_range.width < this.data[g].display_range.label_width){
                if (d.start < this.parent.parent.state.start){
                    this.data[g].display_range.end = this.data[g].display_range.start
                        + this.data[g].display_range.label_width
                        + this.metadata.horizontal_padding;
                    this.data[g].display_range.text_anchor = "start";
                } else if (d.end > this.parent.parent.state.end){
                    this.data[g].display_range.start = this.data[g].display_range.end
                        - this.data[g].display_range.label_width
                        - this.metadata.horizontal_padding;
                    this.data[g].display_range.text_anchor = "end";
                } else {
                    var centered_margin = ((this.data[g].display_range.label_width - this.data[g].display_range.width) / 2)
                        + this.metadata.horizontal_padding;
                    if ((this.data[g].display_range.start - centered_margin) < this.parent.x_scale(this.parent.parent.state.start)){
                        this.data[g].display_range.start = this.parent.x_scale(this.parent.parent.state.start);
                        this.data[g].display_range.end = this.data[g].display_range.start + this.data[g].display_range.label_width;
                        this.data[g].display_range.text_anchor = "start";
                    } else if ((this.data[g].display_range.end + centered_margin) > this.parent.x_scale(this.parent.parent.state.end)) {
                        this.data[g].display_range.end = this.parent.x_scale(this.parent.parent.state.end);
                        this.data[g].display_range.start = this.data[g].display_range.end - this.data[g].display_range.label_width;
                        this.data[g].display_range.text_anchor = "end";
                    } else {
                        this.data[g].display_range.start -= centered_margin;
                        this.data[g].display_range.end += centered_margin;
                    }
                }
                this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            }
            // Add bounding box padding to the calculated display range start, end, and width
            this.data[g].display_range.start -= this.layout.bounding_box_padding;
            this.data[g].display_range.end   += this.layout.bounding_box_padding;
            this.data[g].display_range.width += 2 * this.layout.bounding_box_padding;
            // Convert and stash display range values into domain values
            // (domain: values in terms of the data set, e.g. megabases)
            this.data[g].display_domain = {
                start: this.parent.x_scale.invert(this.data[g].display_range.start),
                end:   this.parent.x_scale.invert(this.data[g].display_range.end)
            };
            this.data[g].display_domain.width = this.data[g].display_domain.end - this.data[g].display_domain.start;

            // Using display range/domain data generated above cast each gene to tracks such that none overlap
            this.data[g].track = null;
            var potential_track = 1;
            while (this.data[g].track == null){
                var collision_on_potential_track = false;
                this.metadata.gene_track_index[potential_track].map(function(placed_gene){
                    if (!collision_on_potential_track){
                        var min_start = Math.min(placed_gene.display_range.start, this.display_range.start);
                        var max_end = Math.max(placed_gene.display_range.end, this.display_range.end);
                        if ((max_end - min_start) < (placed_gene.display_range.width + this.display_range.width)){
                            collision_on_potential_track = true;
                        }
                    }
                }.bind(this.data[g]));
                if (!collision_on_potential_track){
                    this.data[g].track = potential_track;
                    this.metadata.gene_track_index[potential_track].push(this.data[g]);
                } else {
                    potential_track++;
                    if (potential_track > this.metadata.tracks){
                        this.metadata.tracks = potential_track;
                        this.metadata.gene_track_index[potential_track] = [];
                    }
                }
            }

            // Stash parent references on all genes, trascripts, and exons
            this.data[g].parent = this;
            this.data[g].transcripts.map(function(d, t){
                this.data[g].transcripts[t].parent = this.data[g];
                this.data[g].transcripts[t].exons.map(function(d, e){
                    this.data[g].transcripts[t].exons[e].parent = this.data[g].transcripts[t];
                }.bind(this));
            }.bind(this));

        }.bind(this));
        return this;
    };

    // Implement the main render function
    this.render = function(){

        this.assignTracks();

        this.svg.group.selectAll("*").remove();

        // Render gene groups
        var selection = this.svg.group.selectAll("g.lz-data_layer-gene")
            .data(this.data).enter()
            .append("g")
            .attr("class", "lz-data_layer-gene")
            .attr("id", function(d){ return 'g' + d.gene_name.replace(/\W/g,''); })
            .each(function(gene){

                // Render gene bounding box
                d3.select(this).selectAll("rect.lz-data_layer-gene").filter(".lz-bounding_box")
                    .data([gene]).enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-bounding_box")
                    .attr("id", function(d){
                        return 'g' + d.gene_name.replace(/\W/g,'') + "_bounding_box";
                    }.bind(gene))
                    .attr("x", function(d){
                        return d.display_range.start;
                    }.bind(gene.parent))
                    .attr("y", function(d){
                        return ((d.track-1) * this.getTrackHeight());
                    }.bind(gene.parent))
                    .attr("width", function(d){
                        return d.display_range.width;
                    }.bind(gene.parent))
                    .attr("height", function(d){
                        return this.getTrackHeight() - this.layout.track_vertical_spacing;
                    }.bind(gene.parent))
                    .attr("rx", function(d){ return this.layout.bounding_box_padding; }.bind(gene.parent))
                    .attr("ry", function(d){ return this.layout.bounding_box_padding; }.bind(gene.parent));

                // Render gene boundaries
                d3.select(this).selectAll("rect.lz-data_layer-gene").filter(".lz-boundary")
                    .data([gene]).enter().append("rect")
                    .attr("class", "lz-data_layer-gene lz-boundary")
                    .attr("x", function(d){ return this.parent.x_scale(d.start); }.bind(gene.parent))
                    .attr("y", function(d){
                        return ((d.track-1) * this.parent.getTrackHeight())
                            + this.parent.layout.bounding_box_padding
                            + this.parent.layout.label_font_size
                            + this.parent.layout.label_exon_spacing
                            + (Math.max(this.parent.layout.exon_height, 3) / 2);
                    }.bind(gene)) // Arbitrary track height; should be dynamic
                    .attr("width", function(d){ return this.parent.x_scale(d.end) - this.parent.x_scale(d.start); }.bind(gene.parent))
                    .attr("height", 1) // This should be scaled dynamically somehow
                    .attr("fill", "#000099")
                    .style({ cursor: "pointer" })
                    .append("svg:title")
                    .text(function(d) { return d.gene_name; });

                // Render gene labels
                d3.select(this).selectAll("text.lz-data_layer-gene")
                    .data([gene]).enter().append("text")
                    .attr("class", "lz-data_layer-gene lz-label")
                    .attr("x", function(d){
                        if (d.display_range.text_anchor == "middle"){
                            return d.display_range.start + (d.display_range.width / 2);
                        } else if (d.display_range.text_anchor == "start"){
                            return d.display_range.start + this.layout.bounding_box_padding;
                        } else if (d.display_range.text_anchor == "end"){
                            return d.display_range.end - this.layout.bounding_box_padding;
                        }
                    }.bind(gene.parent))
                    .attr("y", function(d){
                        return ((d.track-1) * this.getTrackHeight())
                            + this.layout.bounding_box_padding
                            + this.layout.label_font_size;
                    }.bind(gene.parent))
                    .attr("text-anchor", function(d){ return d.display_range.text_anchor; })
                    .style("font-size", gene.parent.layout.label_font_size)
                    .text(function(d){ return (d.strand == "+") ? d.gene_name + "→" : "←" + d.gene_name; });

                // Render exons (first transcript only, for now)
                d3.select(this).selectAll("g.lz-data_layer-gene").filter(".lz-exons")
                    .data([gene]).enter().append("g")
                    .attr("class", "lz-data_layer-gene lz-exons")
                    .each(function(gene){

                        d3.select(this).selectAll("rect.lz-data_layer-gene").filter(".lz-exon")
                            .data(gene.transcripts[0].exons).enter().append("rect")
                            .attr("class", "lz-data_layer-gene lz-exon")
                            .attr("x", function(d){ return this.parent.x_scale(d.start); }.bind(gene.parent))
                            .attr("y", function(){
                                return ((this.track-1) * this.parent.getTrackHeight())
                                    + this.parent.layout.bounding_box_padding
                                    + this.parent.layout.label_font_size
                                    + this.parent.layout.label_exon_spacing;
                            }.bind(gene))
                            .attr("width", function(d){
                                return this.parent.x_scale(d.end) - this.parent.x_scale(d.start);
                            }.bind(gene.parent))
                            .attr("height", function(){
                                return this.parent.layout.exon_height;
                            }.bind(gene))
                            .attr("fill", "#000099")
                            .style({ cursor: "pointer" });

                    });

            });

        // Apply selectable, tooltip, etc.
        if (this.layout.selectable){
            selection.on("mouseover", function(d){
                var id = 'g' + d.gene_name.replace(/\W/g,'');
                if (this.state.selected_id != id){
                    d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box-hovered");
                    if (this.layout.tooltip){ this.createTooltip(d, id); }
                }
            }.bind(this))
            .on("mouseout", function(d){
                var id = 'g' + d.gene_name.replace(/\W/g,'');
                if (this.state.selected_id != id){
                    d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box");
                    if (this.layout.tooltip){ this.destroyTooltip(id); }
                }
            }.bind(this))
            .on("click", function(d){
                var id = 'g' + d.gene_name.replace(/\W/g,'');
                if (this.state.selected_id == id){
                    this.state.selected_id = null;
                    d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box-hovered");
                } else {
                    if (this.state.selected_id != null){
                        d3.select("#" + this.state.selected_id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box");
                        if (this.layout.tooltip){ this.destroyTooltip(this.state.selected_id); }
                    }
                    this.state.selected_id = id;
                    d3.select("#" + id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box-selected");
                }

            }.bind(this));
            // Apply existing selection from state
            if (this.state.selected_id != null){
                d3.select("#" + this.state.selected_id + "_bounding_box").attr("class", "lz-data_layer-gene lz-bounding_box-selected");
            }
        }
    };
       
    return this;
});
