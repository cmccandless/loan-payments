/*
 * Table format:
 * | Name | Principal ($.00)| Interest (%) | [ReadOnly] Payment | [Remove Button] |
 * |      | 0.00            | 0.00         | 0.00               | X |
 */

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
    $('<input>').val(principal).attr("id","principal").attr("size",10).attr("placeholder","Principal ($)").appendTo(tr);
    $('<input>').val(interest).attr("id","interest").attr("size",10).attr("placeholder","Interest (%)").appendTo(tr);
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
                "principal":$this.find("#principal").val(),
                "interest":$this.find("#interest").val(),
            }
            loans.push(loan);
        }
    });
    return loans;
}

function populateLoansTable(loans) {
    var loansTable = $('#loans');
    var props = ["name","principal","interest"];
    $.each(loans, function(i, loan) {
        var name = loan['name'];
        // If loan not already in table (key on name)
        if ($(`#${name}`).length <= 0) {
            addRow(name, loan.principal, loan.interest);
        }
    });
    return false;
}

$(document).ready(function () {
    addRow();

    $(document).on('click', 'input.removebutton', function() {
        $(this).closest('tr').remove();

        var rows = $("tr.loan");
        if (rows.length == 0) {
            addRow();
        }
        return false;
    });
    
    $("#addrow").click(function () {
        return addRow();
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
            $(`#${id} #payment`).html(loan.payment);
            $.each(loan.payments, function(i, payment) {
                totalPaid += payment;
            });
        });
        totalPaid = round(totalPaid);

        var payoffBox = $("#payoff");
        payoffBox.html(`</br>Months to full payoff: ${termMonths}</br>`);
        payoffBox.append(`Total amount paid: $${totalPaid}`);
        $("#payoff").html(`</br>$${totalPaid} paid in ${termMonths} months! See you next month!`);
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