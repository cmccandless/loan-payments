function round(value, decimalPlaces = 2) {
    const factor = 10 ** decimalPlaces;
    return Math.round(value * factor) / factor;
}

function recalcPriority(loans, termMonths, monthlyBudget) {
    var totalParts = 0;
    var unallocated = monthlyBudget;
    $.each(loans, function(i, loan) {
        loan['dynamicPriority'] = loan.adjusted * loan.monthly;
        totalParts += loan.dynamicPriority;
    });
    if (totalParts === 0) {
        return monthlyBudget;
    }
    $.each(loans, function(i, loan) {
        if (loan.adjusted !== 0) {
            loan.dynamicPriority /= totalParts;
            loan['payment'] = round(loan.dynamicPriority * monthlyBudget);
            if (loan.payment > loan.adjusted) {
                var extra = loan.payment - loan.adjusted;
                loan.payment -= extra;
                loan.adjusted = 0;
                unallocated -= loan.payment;
                loan.payment = round(loan.payment);
                loan['termYears'] = round(termMonths / 12);
                return recalcPriority(loans, termMonths, monthlyBudget - loan.payment);
            } else {
                unallocated -= loan.payment;
            }
        }
    });
    return unallocated;
}

const sanitize = name => name.replace(/[^\w]/gi, '');

function addRow(name = '', principal = '', interest = '') {
    var loansTable = $('#loans');
    var id = sanitize(name);
    var tr = $('<tr>').attr("id",id).attr("class","loan");
    $('<input>').attr("type","image")
        .attr("class","removebutton")
        .attr("src","remove.png")
        .attr("alt","Remove row")
        .attr("width","16")
        .attr("height","16")
        .attr("tabindex","-1")
        .appendTo(tr);
    $('<input>').val(name).attr("id","name").attr("size",30).attr("placeholder","Loan Name").appendTo(tr);
    $('<input>').attr("class","currencytext").val(principal.toFixed(2)).attr("id","principal").attr("size",10).attr("placeholder","Principal ($)").appendTo(tr);
    $('<input>').attr("class","interesttext").val(interest.toFixed(3)).attr("id","interest").attr("size",10).attr("placeholder","Interest (%)").appendTo(tr);
    $('<td>').attr("id","payment").attr("align","right").attr("width",60).appendTo(tr);
    loansTable.append(tr);
    return false;
}

function getLoansFromTable() {
    var loans = [];
    $("tr.loan").each(function() {
        $this = $(this);
        // $this.find('#payment').val("10.01");
        var name = $this.find("#name").val();
        $this.attr("id",sanitize(name));
        if (name !== '') {
            var loan = {
                "name":name,
                "principal":parseFloat($this.find("#principal").val()),
                "interest":parseFloat($this.find("#interest").val()),
            }
            var payment = $this.find('#payment').html();
            if (payment !== '') {
                loan['payment'] = parseFloat(payment);
            }
            loans.push(loan);
        }
    });
    return loans;
}

function populateLoansTable(loans) {
    var loansTable = $('#loans');
    loansTable.empty();
    var props = ["name","principal","interest"];
    $.each(loans, function(i, loan) {
        var name = loan['name'];
        // If loan not already in table (key on name)
        if ($(`#${name}`).length <= 0) {
            addRow(name, loan.principal, loan.interest);
        }
    });
    addRow();
}

function download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) { // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    } else {
        var a = document.createElement('a');
        var url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

function saveFile(filename, text) {
    var fs = require('fs');
    fs.writeFile(filename, text, function(err) {
        if (err) {
            console.log(err);
        }
    });
}

$(document).ready(function () {
    addRow();
    addRow();

    $(document).on('click', 'input.removebutton', function() {
        $(this).closest('tr').remove();

        var rows = $("tr.loan");
        if (rows.length == 0) {
            addRow();
        }
        return false;
    });
    
    $(document).on('change', 'input.currencytext', function() {
        $(this).val($(this).val().toFixed(2));
    });
    
    $(document).on('change', 'input.interesttext', function() {
        $(this).val($(this).val().toFixed(3));
    });
    
    $("#addrow").click(function () {
        return addRow();
    });

    $("#import-button").click(function () {
        if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
            alert('The File APIs are not fully supported in this browser.');
            return;
        }

        var input = document.getElementById('import-file');
        if (!input.files) {
            alert("This browser doesn't seem to support the `files` property of file inputs.");
        } else if (!input.files[0]) {
            alert('Please select a loans file to import');
        } else {
            var file = input.files[0];
            fr = new FileReader();
            fr.onload = receivedText;
            fr.readAsText(file);
        }
    });

    function receivedText() {
        var loans = JSON.parse(fr.result);
        populateLoansTable(loans);
    }

    $('#export-button').click(function() {
        var loans = getLoansFromTable();
        download(JSON.stringify(loans, null, 2), 'loans.json', 'application/json');
    });
    
    $("#calculate").click(function() {
        var months = 0;
        var budget = $("#budget").val();
        if (budget.length == 0) {
            // alert('Please set a monthly budget.');
            $("#budget").css('border-color', 'red');
            $("#budget").focus();
            return false;
        } else if (!/^\d+(\.\d\d)?$/.test(budget)) {
            // alert(`${budget} is not a valid monetary amount`);
            $("#budget").css('border-color', 'red');
            $("#budget").focus();
            return false;
        }
        $("#budget").css('border-color', 'transparent');

        var loans = [];
        var loans = getLoansFromTable();
        $.each(loans, function(i, loan) {
            loan['monthly'] = loan.interest / 100 / 12;
            loan['adjusted'] = loan.principal;
            loan['payments'] = [];
        });

        if (loans.length === 0) {
            alert("Provide information for at least 1 loan");
            return false;
        }

        let termMonths = 1;
        let prev = budget;
        let unallocated = recalcPriority(loans, termMonths, budget);
        while (unallocated < budget) {
            $.each(loans, function(i, loan) {
                let payment = loan.payment;
                if (loan.adjusted !== 0) {
                    if (payment >= loan.adjusted) {
                        payment = loan.adjusted;
                        loan['termYears'] = round(termMonths / 12);
                    }
                    loan.payments.push(round(payment));
                    loan.adjusted -= payment;
                    loan.adjusted += loan.adjusted * loan.monthly;
                } else if (!loan.paid) {
                    loan.payments.push(round(payment));
                    loan['paid'] = true;
                }
            });
            prev = unallocated;
            unallocated = recalcPriority(loans, termMonths, budget);
            termMonths += 1;
        }

        termMonths -= 1;
        unallocated = round(prev);
        let totalMonthly = budget
        let termYears = round(termMonths / 12);

        let totalPaid = 0;
        $.each(loans, function(i, loan) {
            loan['payment'] = loan['payments'][0];
            var id = sanitize(loan.name);
            $(`#${id} #payment`).html(loan.payment.toFixed(2));
            $.each(loan.payments, function(i, payment) {
                totalPaid += payment;
            });
        });
        totalPaid = round(totalPaid);

        var payoffBox = $("#payoff");
        payoffBox.html(`</br>Months to full payoff: ${termMonths}</br>`);
        payoffBox.append(`Total amount paid: $${totalPaid.toFixed(2)}`);
        return false;
    });

    $("#mainform").keypress(function(e) {
        // Enter key
        if ((e.which && e.which === 13) || (e.keyCode && e.keyCode === 13)) {
            $('#calculate').click();
            return false;
        } else {
            return true;
        }
    });
});
